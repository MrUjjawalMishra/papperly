import { expect, it } from "vitest";
import {
  cloudflareClient,
  provisionPrivateResources,
  validateTarget,
} from "../scripts/deploy-staging.mjs";
import { readFileSync } from "node:fs";
const target = JSON.parse(
  readFileSync("docs/staging-release-target.json", "utf8"),
);
const env = {
  GITHUB_REPOSITORY: target.repository,
  CLOUDFLARE_ACCOUNT_ID: target.accountId,
  GITHUB_SHA: "a".repeat(40),
  CLOUDFLARE_API_TOKEN: crypto.randomUUID(),
  SUPABASE_SERVICE_ROLE_KEY: crypto.randomUUID(),
};
it("rejects another account, repository, missing server key and unreviewed migrations before provisioning", () => {
  expect(() => validateTarget(target, env)).not.toThrow();
  for (const changed of [
    { CLOUDFLARE_ACCOUNT_ID: "b".repeat(32) },
    { GITHUB_REPOSITORY: "other/repository" },
    { SUPABASE_SERVICE_ROLE_KEY: "" },
  ])
    expect(() => validateTarget(target, { ...env, ...changed })).toThrow();
  expect(() => validateTarget(target, env, "changed")).toThrow(
    "Migration changes",
  );
});
it("checks every Queue page before creation and reuses an existing private bucket and Queue", async () => {
  const calls = [];
  const api = async (path, method = "GET") => {
    calls.push([path, method]);
    if (method !== "GET") throw Error("must reuse resources");
    if (path.endsWith("domains/managed")) return { result: { enabled: false } };
    if (path.endsWith("domains/custom")) return { result: { domains: [] } };
    if (path.startsWith("/queues"))
      return {
        result: path.includes("page=2&")
          ? [{ queue_name: target.queue, queue_id: "queue-id" }]
          : [],
        result_info: { total_pages: 2 },
      };
    return { result: { name: target.bucket } };
  };
  // A full nonmatching first page establishes that page two must also be read.
  const paginated = (path, method) =>
    path.includes("page=1&")
      ? Promise.resolve({
          result: [{ queue_name: "unrelated", queue_id: "other" }],
          result_info: { total_pages: 2 },
        })
      : api(path, method);
  const result = await provisionPrivateResources(paginated, target);
  expect(result.bucketCreated).toBe(false);
  expect(result.queueCreated).toBe(false);
  expect(result.queueId).toBe("queue-id");
  expect(calls.some(([p]) => p.includes("page=2&"))).toBe(true);
});
it("creates only the authorized names and is retry-safe after a partial bucket creation", async () => {
  let bucket = false,
    queue = false;
  const writes = [];
  const api = async (path, method = "GET", body) => {
    if (method === "POST") {
      writes.push({ path, body });
      if (path === "/r2/buckets") {
        bucket = true;
        return { result: { name: body.name } };
      }
      if (path === "/queues") {
        queue = true;
        return {
          result: { queue_name: body.queue_name, queue_id: "queue-id" },
        };
      }
      throw Error("unexpected create");
    }
    if (path.endsWith("domains/managed")) return { result: { enabled: false } };
    if (path.endsWith("domains/custom")) return { result: { domains: [] } };
    if (path.startsWith("/queues"))
      return {
        result: queue
          ? [{ queue_name: target.queue, queue_id: "queue-id" }]
          : [],
        result_info: { total_pages: 1 },
      };
    return bucket ? { result: { name: target.bucket } } : null;
  };
  await provisionPrivateResources(api, target);
  await provisionPrivateResources(api, target);
  expect(writes).toEqual([
    {
      path: "/r2/buckets",
      body: { name: target.bucket, storageClass: "Standard" },
    },
    { path: "/queues", body: { queue_name: target.queue } },
  ]);
});
it("refuses existing public buckets before creating a Queue", async () => {
  const paths = [];
  await expect(
    provisionPrivateResources(async (path) => {
      paths.push(path);
      return {
        result: path.endsWith("domains/managed")
          ? { enabled: true }
          : { name: target.bucket },
      };
    }, target),
  ).rejects.toThrow("public access");
  expect(paths.some((p) => p.startsWith("/queues"))).toBe(false);
});
it("never follows redirects or exposes token/provider message contents on a denied mutation", async () => {
  const secret = crypto.randomUUID();
  const api = cloudflareClient(
    target.accountId,
    secret,
    async (url, options) => {
      expect(options.redirect).toBe("error");
      expect(new URL(url).origin).toBe("https://api.cloudflare.com");
      return Response.json(
        { success: false, errors: [{ code: 10000, message: secret }] },
        { status: 403 },
      );
    },
  );
  await expect(
    api("/queues", "POST", { queue_name: target.queue }),
  ).rejects.toThrow("HTTP 403; codes 10000");
  try {
    await api("/queues");
  } catch (error) {
    expect(error.message).not.toContain(secret);
  }
});

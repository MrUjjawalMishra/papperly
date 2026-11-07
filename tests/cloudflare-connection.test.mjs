import { expect, it } from "vitest";
import { verifyCloudflareConnection } from "../scripts/check-cloudflare-connection.mjs";
const accountId = "a".repeat(32),
  token = crypto.randomUUID();
it("uses only GET, verifies the account, and returns only matching staging candidates", async () => {
  const paths = [];
  const report = await verifyCloudflareConnection(
    { accountId, token },
    async (url, options) => {
      expect(options.method).toBe("GET");
      expect(options.redirect).toBe("error");
      expect(new URL(url).origin).toBe("https://api.cloudflare.com");
      expect(url).not.toContain(token);
      paths.push(new URL(url).pathname);
      let result;
      if (url.endsWith(`/accounts/${accountId}`)) result = { id: accountId };
      else if (url.endsWith("/workers/scripts"))
        result = [{ id: "papperly-api-staging" }, { id: "unrelated-worker" }];
      else if (url.endsWith("/r2/buckets"))
        result = {
          buckets: [
            { name: "papperly-staging-private" },
            { name: "unrelated-bucket" },
          ],
        };
      else if (url.endsWith("/queues"))
        result = [
          { queue_name: "papperly-staging-jobs", queue_id: "synthetic-queue" },
        ];
      else result = { subdomain: "synthetic-subdomain" };
      return Response.json({ success: true, result });
    },
  );
  expect(paths).toHaveLength(5);
  expect(report.access).toEqual({
    account: true,
    workers: true,
    r2: true,
    queues: true,
  });
  expect(JSON.stringify(report)).not.toContain(token);
  expect(JSON.stringify(report)).not.toContain("unrelated");
});
it("fails closed before network access when credentials are missing", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    throw Error("must not run");
  };
  await expect(
    verifyCloudflareConnection({ accountId, token: "" }, fetcher),
  ).rejects.toThrow("staging environment secret");
  await expect(
    verifyCloudflareConnection({ accountId: "invalid", token }, fetcher),
  ).rejects.toThrow("32-character");
  expect(calls).toBe(0);
});
it("does not expose provider errors containing a token", async () => {
  await expect(
    verifyCloudflareConnection({ accountId, token }, async () =>
      Response.json(
        { success: false, errors: [{ message: token }] },
        { status: 403 },
      ),
    ),
  ).rejects.toThrow("Cloudflare account identity denied or failed (HTTP 403)");
});
it("does not inspect other resources after an account identity mismatch", async () => {
  let calls = 0;
  await expect(
    verifyCloudflareConnection({ accountId, token }, async () => {
      calls++;
      return Response.json({ success: true, result: { id: "other-account" } });
    }),
  ).rejects.toThrow("identity mismatch");
  expect(calls).toBe(1);
});
it("reports both absent GitHub settings without making any provider request", async () => {
  let calls = 0;
  await expect(
    verifyCloudflareConnection({}, async () => {
      calls++;
      throw Error("must not run");
    }),
  ).rejects.toThrow("Neither Cloudflare setting reached this job");
  expect(calls).toBe(0);
});

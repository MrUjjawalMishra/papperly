import process from "node:process";
import console from "node:console";
import { createHash, randomBytes } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export function migrationDigest(directory = "supabase/migrations") {
  const h = createHash("sha256");
  for (const name of readdirSync(directory)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    h.update(name + "\0")
      .update(readFileSync(join(directory, name)))
      .update("\0");
  return h.digest("hex");
}

export function validateTarget(target, env, digest = migrationDigest()) {
  if (
    env.GITHUB_REPOSITORY !== "MrUjjawalMishra/papperly" ||
    target.repository !== env.GITHUB_REPOSITORY ||
    env.CLOUDFLARE_ACCOUNT_ID !== target.accountId ||
    target.accountId !== "e746f9041a0f5eddfd51c206531b3393" ||
    target.worker !== "papperly-api-staging" ||
    target.bucket !== "papperly-staging-private" ||
    target.queue !== "papperly-staging-jobs" ||
    target.supabaseUrl !== "https://soudjtewvquywncqtwyo.supabase.co" ||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "")
  )
    throw Error("Staging target identity mismatch");
  if (digest !== target.migrationDigest)
    throw Error(
      "Migration changes require live migration review/application before deployment",
    );
  if (!env.CLOUDFLARE_API_TOKEN?.trim())
    throw Error("Missing Cloudflare environment secret");
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim())
    throw Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY in GitHub environment Cloudflare",
    );
  if (!target.supabasePublishableKey?.startsWith("sb_publishable_"))
    throw Error("Missing verified staging publishable key");
}

export function cloudflareClient(accountId, token, fetcher = fetch) {
  return async (path, method = "GET", body, optional = false) => {
    let response;
    try {
      response = await fetcher(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`,
        {
          method,
          redirect: "error",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        },
      );
    } catch {
      throw Error(
        `Cloudflare ${method} ${path.split("?")[0]} transport failure`,
      );
    }
    const data = await response.json().catch(() => null);
    if (optional && response.status === 404) return null;
    if (!response.ok || data?.success !== true)
      throw Error(
        `Cloudflare ${method} ${path.split("?")[0]} failed (HTTP ${response.status}; codes ${(
          data?.errors ?? []
        )
          .map((e) => Number(e.code))
          .filter(Number.isFinite)
          .join(",")})`,
      );
    return data;
  };
}

export async function provisionPrivateResources(api, target) {
  // Exact bucket GET avoids a partial-list existence decision.
  let bucket = await api(
    `/r2/buckets/${target.bucket}`,
    "GET",
    undefined,
    true,
  );
  let bucketCreated = false;
  if (!bucket) {
    await api("/r2/buckets", "POST", {
      name: target.bucket,
      storageClass: "Standard",
    });
    bucketCreated = true;
  }
  const managed = await api(`/r2/buckets/${target.bucket}/domains/managed`);
  if (managed.result?.enabled === true) {
    if (!bucketCreated)
      throw Error(
        "Existing staging bucket has public access; manual resource review required",
      );
    await api(`/r2/buckets/${target.bucket}/domains/managed`, "PUT", {
      enabled: false,
    });
  } else if (managed.result?.enabled !== false)
    throw Error("Unexpected R2 public access metadata");
  const custom = await api(`/r2/buckets/${target.bucket}/domains/custom`);
  if (
    !Array.isArray(custom.result?.domains) ||
    custom.result.domains.some((d) => d.enabled !== false)
  )
    throw Error("R2 custom domain access is not verified private");
  let queue;
  for (let page = 1; page <= 1000; page++) {
    const response = await api(`/queues?page=${page}&per_page=100`);
    if (!Array.isArray(response.result))
      throw Error("Unexpected Queue metadata");
    queue = response.result.find((q) => q.queue_name === target.queue);
    if (queue) break;
    const pages = response.result_info?.total_pages;
    if (
      (Number.isInteger(pages) && page >= pages) ||
      response.result.length === 0
    )
      break;
    if (!Number.isInteger(pages))
      throw Error(
        "Queue pagination metadata missing; refusing unsafe creation",
      );
    if (page === 1000) throw Error("Queue pagination exceeded safety limit");
  }
  const queueCreated = !queue;
  if (!queue)
    queue = (await api("/queues", "POST", { queue_name: target.queue })).result;
  if (queue?.queue_name !== target.queue || typeof queue.queue_id !== "string")
    throw Error("Queue identity mismatch");
  return {
    bucket: target.bucket,
    bucketCreated,
    privateAccessVerified: true,
    queue: target.queue,
    queueId: queue.queue_id,
    queueCreated,
  };
}

async function main() {
  const target = JSON.parse(
    readFileSync("docs/staging-release-target.json", "utf8"),
  );
  const env = process.env;
  validateTarget(target, env);
  const report = {
    environment: "staging",
    accountId: target.accountId,
    commit: env.GITHUB_SHA,
    migrationVersion: target.migrationVersion,
    migrationDigest: target.migrationDigest,
    startedAt: new Date().toISOString(),
    deployed: false,
  };
  mkdirSync("work", { recursive: true });
  const save = () =>
    writeFileSync(
      "work/staging-release.json",
      JSON.stringify(report, null, 2) + "\n",
    );
  const api = cloudflareClient(target.accountId, env.CLOUDFLARE_API_TOKEN);
  let temporary;
  const sensitive = [env.CLOUDFLARE_API_TOKEN, env.SUPABASE_SERVICE_ROLE_KEY];
  const safe = (text) =>
    sensitive.reduce(
      (s, value) => (value ? s.replaceAll(value, "[REDACTED]") : s),
      text,
    );
  try {
    const account = await api("");
    if (account.result?.id !== target.accountId)
      throw Error("Cloudflare account mismatch");
    const subdomain = await api("/workers/subdomain");
    if (subdomain.result?.subdomain !== target.workersSubdomain)
      throw Error("Workers subdomain mismatch");
    const server = await fetch(
      target.supabaseUrl + "/rest/v1/rpc/runtime_rate",
      {
        method: "POST",
        redirect: "error",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          ...(env.SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_secret_")
            ? {}
            : { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p: { key: "staging-deployment-check", limit: 1000 },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!server.ok)
      throw Error(
        `Supabase staging service-key check failed (HTTP ${server.status})`,
      );
    report.supabaseServiceKeyVerified = true;
    const subscription = await api("/subscriptions").catch(() => null);
    report.billing = {
      planReadAvailable: Boolean(subscription),
      upgradePerformed: false,
    };
    const previous = await api(
      `/workers/scripts/${target.worker}/settings`,
      "GET",
      undefined,
      true,
    );
    if (previous) {
      const bindings = previous.result?.bindings;
      if (
        !Array.isArray(bindings) ||
        !bindings.some(
          (b) => b.name === "ENVIRONMENT" && b.text === "staging",
        ) ||
        !bindings.some(
          (b) => b.name === "SUPABASE_URL" && b.text === target.supabaseUrl,
        )
      )
        throw Error(
          "Existing Worker is not verified as this staging deployment",
        );
      const deployments = await api(
        `/workers/scripts/${target.worker}/deployments`,
      );
      report.previousDeploymentId =
        deployments.result?.deployments?.[0]?.id ?? null;
    }
    report.resources = await provisionPrivateResources(api, target);
    save();
    const secrets = {
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    };
    const existingSecrets = previous
      ? (await api(`/workers/scripts/${target.worker}/secrets`)).result
      : [];
    if (!Array.isArray(existingSecrets))
      throw Error("Unexpected Worker secrets metadata");
    if (!existingSecrets.some((s) => s.name === "SESSION_ENCRYPTION_KEY")) {
      secrets.SESSION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
      sensitive.push(secrets.SESSION_ENCRYPTION_KEY);
    }
    temporary = mkdtempSync(
      join(env.RUNNER_TEMP ?? tmpdir(), "papperly-secrets-"),
    );
    const secretPath = join(temporary, "secrets.json");
    writeFileSync(secretPath, JSON.stringify(secrets), { mode: 0o600 });
    const apiUrl = `https://${target.worker}.${target.workersSubdomain}.workers.dev`;
    const args = [
      "node_modules/wrangler/bin/wrangler.js",
      "deploy",
      "--config",
      "apps/api/wrangler.jsonc",
      "--env",
      "staging",
      "--secrets-file",
      secretPath,
      "--var",
      `SUPABASE_URL:${target.supabaseUrl}`,
      "--var",
      `SUPABASE_ANON_KEY:${target.supabasePublishableKey}`,
      "--var",
      `RELEASE_SHA:${env.GITHUB_SHA}`,
      "--var",
      `ALLOWED_ORIGINS:${apiUrl}`,
      "--var",
      `AUTH_ALIAS_DOMAIN:${target.authAliasDomain}`,
      "--message",
      `Papperly staging ${env.GITHUB_SHA}`,
    ];
    const deployed = spawnSync(process.execPath, args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      env: { ...env, WRANGLER_SEND_METRICS: "false" },
    });
    console.log(safe((deployed.stdout ?? "") + (deployed.stderr ?? "")));
    if (deployed.status !== 0)
      throw Error(
        "Wrangler staging deployment failed; inspect redacted workflow output",
      );
    report.deployed = true;
    report.apiUrl = apiUrl;
    const current = await api(`/workers/scripts/${target.worker}/deployments`);
    report.deploymentId = current.result?.deployments?.[0]?.id ?? null;
    const settings = (await api(`/workers/scripts/${target.worker}/settings`))
      .result;
    const bindings = settings?.bindings ?? [];
    report.bindingsVerified =
      bindings.some(
        (b) => b.name === "FILES" && b.bucket_name === target.bucket,
      ) &&
      bindings.some((b) => b.name === "JOBS" && b.queue_name === target.queue);
    if (!report.bindingsVerified)
      throw Error("Deployed staging bindings mismatch");
    const schedules = (await api(`/workers/scripts/${target.worker}/schedules`))
      .result;
    report.scheduleConfigured =
      Array.isArray(schedules?.schedules) &&
      schedules.schedules.some((s) => s.cron === "* * * * *");
    const queue = (await api(`/queues/${report.resources.queueId}`)).result;
    report.queueConsumerConfigured =
      Array.isArray(queue?.consumers) &&
      queue.consumers.some((c) => c.script_name === target.worker);
    // Metadata checks do not prove a scheduled invocation or message delivery succeeded.
    save();
    const smoke = spawnSync(process.execPath, ["scripts/live-smoke.mjs"], {
      encoding: "utf8",
      env: {
        ...env,
        STAGING_API_URL: apiUrl,
        EXPECTED_RELEASE_SHA: env.GITHUB_SHA,
      },
    });
    console.log(safe((smoke.stdout ?? "") + (smoke.stderr ?? "")));
    if (smoke.status !== 0) throw Error("Live smoke failed after deployment");
    report.basicSmokePassed = true;
    report.completedAt = new Date().toISOString();
    report.limitations =
      "Basic release smoke only; full multi-role, scheduled/queue processing, file, external-provider and load/restore acceptance remains outstanding. No real student provisioning or frontend deployed.";
    save();
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.error = safe(
      error instanceof Error ? error.message : "Staging deployment failed",
    );
    save();
    console.error(report.error);
    process.exitCode = 1;
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();

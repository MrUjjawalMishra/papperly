import process from "node:process";
import console from "node:console";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function verifyCloudflareConnection(
  { accountId, token },
  fetcher = fetch,
) {
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? ""))
    throw Error(
      "Set the staging environment variable CLOUDFLARE_ACCOUNT_ID to the account's 32-character ID.",
    );
  if (!token?.trim())
    throw Error(
      "Set the staging environment secret CLOUDFLARE_API_TOKEN. Never put it in source or logs.",
    );
  async function read(path, label) {
    let response;
    try {
      response = await fetcher("https://api.cloudflare.com/client/v4" + path, {
        method: "GET",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw Error(
        `Cloudflare ${label} request failed; check connectivity and token access.`,
      );
    }
    if (response.status === 404 && label === "Workers subdomain read")
      return null;
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true)
      throw Error(
        `Cloudflare ${label} denied or failed (HTTP ${response.status}); check the selected account and token permissions.`,
      );
    return data.result;
  }
  const account = await read(`/accounts/${accountId}`, "account identity");
  if (account?.id !== accountId)
    throw Error("Cloudflare account identity mismatch.");
  const reads = await Promise.allSettled([
    read(`/accounts/${accountId}/workers/scripts`, "Workers read"),
    read(`/accounts/${accountId}/r2/buckets`, "R2 read"),
    read(`/accounts/${accountId}/queues`, "Queues read"),
    read(`/accounts/${accountId}/workers/subdomain`, "Workers subdomain read"),
  ]);
  for (const result of reads)
    if (result.status === "rejected") throw result.reason;
  const [workers, buckets, queues, subdomain] = reads.map((r) => r.value);
  if (
    !Array.isArray(workers) ||
    !Array.isArray(buckets?.buckets) ||
    !Array.isArray(queues)
  )
    throw Error("Cloudflare returned unexpected resource metadata.");
  const worker = workers.find((w) => w.id === "papperly-api-staging");
  const bucket = buckets.buckets.find(
    (b) => b.name === "papperly-staging-private",
  );
  const queue = queues.find((q) => q.queue_name === "papperly-staging-jobs");
  return {
    accountId,
    checkedAt: new Date().toISOString(),
    mode: "read-only connection check",
    access: { account: true, workers: true, r2: true, queues: true },
    workersSubdomain:
      typeof subdomain?.subdomain === "string" ? subdomain.subdomain : null,
    stagingCandidates: {
      worker: worker ? { name: worker.id } : null,
      bucket: bucket ? { name: bucket.name } : null,
      queue: queue ? { name: queue.queue_name, id: queue.queue_id } : null,
    },
    limitations:
      "Resource names are candidates, not approved deployment targets. Private access, write permissions, budget, bindings and the full backend release still need verification. No resources were created or modified.",
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const report = await verifyCloudflareConnection({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      token: process.env.CLOUDFLARE_API_TOKEN,
    });
    mkdirSync("work", { recursive: true });
    writeFileSync(
      "work/cloudflare-connection.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Cloudflare verification failed.",
    );
    process.exitCode = 1;
  }
}

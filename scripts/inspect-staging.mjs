import process from "node:process";
import console from "node:console";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { cloudflareClient } from "./deploy-staging.mjs";
const target = JSON.parse(
  readFileSync("docs/staging-release-target.json", "utf8"),
);
if (process.env.CLOUDFLARE_ACCOUNT_ID !== target.accountId)
  throw Error("Staging account mismatch");
const api = cloudflareClient(
  target.accountId,
  process.env.CLOUDFLARE_API_TOKEN,
);
const id = "f80c4cea111642e9aa2e0794d3854f2c";
const consumers = (await api(`/queues/${id}/consumers`)).result;
if (!Array.isArray(consumers)) throw Error("Unexpected consumers metadata");
const report = {
  checkedAt: new Date().toISOString(),
  mode: "read-only staging resource inspection",
  queueId: id,
  consumers: consumers
    .filter((c) => c.type === "worker")
    .map((c) => ({
      keys: Object.keys(c),
      type: c.type,
      scriptName: c.script_name ?? null,
      script: typeof c.script === "string" ? c.script : null,
      serviceName: c.service?.name ?? null,
    })),
  schedule: (await api(`/workers/scripts/${target.worker}/schedules`)).result,
};
mkdirSync("work", { recursive: true });
writeFileSync(
  "work/staging-inspection.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));

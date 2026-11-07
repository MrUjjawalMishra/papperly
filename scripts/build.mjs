import process from "node:process";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const result = spawnSync(
  "node",
  [
    "node_modules/wrangler/bin/wrangler.js",
    "deploy",
    "--dry-run",
    "--outdir",
    resolve("dist"),
    "--config",
    "apps/api/wrangler.jsonc",
    "--env",
    "staging",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      XDG_CONFIG_HOME: resolve(".wrangler/config"),
      WRANGLER_LOG_PATH: resolve(".wrangler/logs/build.log"),
      WRANGLER_SEND_METRICS: "false",
    },
  },
);
process.exit(result.status ?? 1);

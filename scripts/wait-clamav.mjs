import { Buffer } from "node:buffer";
import process from "node:process";
import console from "node:console";
import { setTimeout as delay } from "node:timers/promises";
import { scanBytes } from "../apps/scanner/server.mjs";
const daemon = {
  host: "127.0.0.1",
  port: Number(process.env.CLAMD_PORT ?? 33310),
};
const deadline = Date.now() + 300000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const r = await scanBytes(Buffer.from("Papperly synthetic readiness"), {
      daemon,
    });
    if (r.verdict === "clean") {
      ready = true;
      break;
    }
  } catch {
    /* Keep freshness/scan checks enforced while definitions initialize. */
  }
  await delay(2000);
}
if (!ready) {
  console.error(
    "ClamAV did not load current verified definitions within five minutes",
  );
  process.exitCode = 1;
} else console.log("ClamAV current definitions and real scan ready");

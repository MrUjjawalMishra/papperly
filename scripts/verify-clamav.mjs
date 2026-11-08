import { zipSync } from "fflate";
import process from "node:process";
import console from "node:console";
import { randomUUID, createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { scannerServer, daemonExchange } from "../apps/scanner/server.mjs";
const daemon = {
  host: "127.0.0.1",
  port: Number(process.env.CLAMD_PORT ?? 33310),
};
const engine = await daemonExchange(daemon, "VERSIONCOMMANDS", undefined, 3000);
const secret = randomUUID(),
  server = scannerServer({ secret, daemon });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const report = {
  engineVersion: engine.split("|")[0].trim(),
  gateway: "authenticated localhost HTTP → actual ClamAV INSTREAM",
  persistentHostDeployed: false,
  checks: [],
  passed: false,
};
try {
  const eicar = Buffer.from(
    "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
  );
  for (const [name, bytes, expected] of [
    [
      "synthetic clean document",
      Buffer.from("Synthetic clean educational document"),
      "clean",
    ],
    ["harmless EICAR antivirus test", eicar, "infected"],
    [
      "archive with harmless EICAR test",
      Buffer.from(zipSync({ "eicar.txt": eicar })),
      "infected",
    ],
    [
      "archive within permitted expanded-file bounds",
      Buffer.from(zipSync({ "large.txt": Buffer.alloc(11 * 1024 * 1024, 65) })),
      "clean",
    ],
    [
      "archive exceeding expanded-file scan limits",
      Buffer.from(zipSync({ "large.txt": Buffer.alloc(21 * 1024 * 1024, 65) })),
      "unavailable",
    ],
  ]) {
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const r = await fetch(`http://127.0.0.1:${server.address().port}/scan`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/octet-stream",
        "X-SHA256": checksum,
      },
      body: bytes,
    });
    const data = await r.json();
    const passed =
      expected === "unavailable"
        ? r.status === 503 && data.error === "SCANNER_UNAVAILABLE"
        : r.status === 200 &&
          data.verdict === expected &&
          data.checksum === checksum;
    report.checks.push({
      name,
      httpStatus: r.status,
      expected,
      actual: data.verdict ?? data.error,
      passed,
    });
    if (!passed) throw Error("Real ClamAV gateway check failed");
  }
  report.passed = true;
} catch {
  process.exitCode = 1;
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  mkdirSync("work", { recursive: true });
  writeFileSync(
    "work/clamav-verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}

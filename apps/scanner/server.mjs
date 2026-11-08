import { verifyArchive } from "./archive.mjs";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { createHash, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { setTimeout as schedule, clearTimeout } from "node:timers";
import process from "node:process";
import console from "node:console";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const MAX_SCAN_BYTES = 10 * 1024 * 1024;
export function daemonExchange(options, command, bytes, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(options);
    let reply = Buffer.alloc(0),
      settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(Error(error));
      else resolve(value);
    };
    const timer = schedule(() => finish("SCANNER_TIMEOUT"), timeoutMs);
    socket.on("error", () => finish("SCANNER_UNAVAILABLE"));
    socket.on("connect", () => {
      socket.write(Buffer.from(`z${command}\0`));
      if (bytes) {
        for (let offset = 0; offset < bytes.length; offset += 65536) {
          const chunk = bytes.subarray(offset, offset + 65536),
            size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          socket.write(size);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      }
    });
    socket.on("data", (chunk) => {
      reply = Buffer.concat([reply, chunk]);
      if (reply.length > 4096) return finish("SCANNER_INVALID_RESPONSE");
      const end = reply.indexOf(0);
      if (end !== -1) finish(null, reply.subarray(0, end).toString("utf8"));
    });
    socket.on("close", () => {
      if (!settled) finish("SCANNER_INCOMPLETE_RESPONSE");
    });
  });
}
export async function scanBytes(
  bytes,
  { daemon, now = Date.now, exchange = daemonExchange } = {},
) {
  if (!bytes.length || bytes.length > MAX_SCAN_BYTES)
    throw Error("UNSUPPORTED_SCAN_SIZE");
  verifyArchive(bytes);
  const version = await exchange(daemon, "VERSIONCOMMANDS", undefined, 3000);
  const match = /^ClamAV [^/]+\/\d+\/([^|]+)\|.*\bINSTREAM\b/.exec(version);
  const built = match ? Date.parse(match[1].trim() + " UTC") : NaN;
  if (
    !Number.isFinite(built) ||
    built > now() + 3600000 ||
    now() - built > 48 * 3600000
  )
    throw Error("SCANNER_SIGNATURES_STALE_OR_UNKNOWN");
  const reply = await exchange(daemon, "INSTREAM", bytes);
  let verdict;
  if (/Heuristics\.(Limits\.Exceeded|Encrypted)/.test(reply))
    throw Error("SCANNER_INCOMPLETE_OR_LIMITED_SCAN");
  if (reply === "stream: OK") verdict = "clean";
  else if (/^stream: .+ FOUND$/.test(reply)) verdict = "infected";
  else throw Error("SCANNER_INCOMPLETE_OR_LIMITED_SCAN");
  return {
    checksum: createHash("sha256").update(bytes).digest("hex"),
    verdict,
  };
}
export function scannerServer({
  secret,
  daemon,
  scan = scanBytes,
  maxConcurrent = 2,
}) {
  if (typeof secret !== "string" || secret.length < 32)
    throw Error("SCANNER_API_KEY of at least 32 characters is required");
  const expected = Buffer.from(`Bearer ${secret}`);
  let active = 0;
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    const send = (status, body) => {
      res.writeHead(status);
      res.end(JSON.stringify(body));
    };
    const provided = Buffer.from(req.headers.authorization ?? "");
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      req.resume();
      return send(401, { error: "UNAUTHENTICATED" });
    }
    if (req.method !== "POST" || req.url !== "/scan") {
      req.resume();
      return send(404, { error: "NOT_FOUND" });
    }
    if (
      req.headers["content-type"] !== "application/octet-stream" ||
      !/^[a-f0-9]{64}$/.test(req.headers["x-sha256"] ?? "")
    ) {
      req.resume();
      return send(400, { error: "INVALID_SCAN_REQUEST" });
    }
    if (active >= maxConcurrent) {
      req.resume();
      res.setHeader("Retry-After", "3");
      return send(429, { error: "SCANNER_BUSY" });
    }
    if (Number(req.headers["content-length"] ?? 0) > MAX_SCAN_BYTES) {
      req.resume();
      return send(413, { error: "UNSUPPORTED_SCAN_SIZE" });
    }
    active++;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_SCAN_BYTES) {
          send(413, { error: "UNSUPPORTED_SCAN_SIZE" });
          req.resume();
          return;
        }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks),
        checksum = createHash("sha256").update(bytes).digest("hex");
      if (checksum !== req.headers["x-sha256"])
        return send(409, { error: "SCAN_CHECKSUM_MISMATCH" });
      const result = await scan(bytes, { daemon });
      if (
        result.checksum !== checksum ||
        !["clean", "infected"].includes(result.verdict)
      )
        return send(503, { error: "SCANNER_INVALID_RESPONSE" });
      send(200, result);
    } catch {
      if (!res.headersSent) send(503, { error: "SCANNER_UNAVAILABLE" });
      else res.end();
    } finally {
      active--;
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 5000;
  server.maxRequestsPerSocket = 10;
  return server;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const daemon = process.env.CLAMD_SOCKET
      ? { path: process.env.CLAMD_SOCKET }
      : {
          host: process.env.CLAMD_HOST ?? "127.0.0.1",
          port: Number(process.env.CLAMD_PORT ?? 3310),
        };
    const server = scannerServer({
      secret: process.env.SCANNER_API_KEY,
      daemon,
    });
    server.listen(
      Number(process.env.PORT ?? 8080),
      process.env.LISTEN_HOST ?? "127.0.0.1",
      () =>
        console.log(
          "Private scanner gateway listening; no payload or credentials logged",
        ),
    );
  } catch {
    console.error("Scanner configuration invalid; no credentials logged");
    process.exitCode = 1;
  }
}

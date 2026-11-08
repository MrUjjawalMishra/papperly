import { expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { once } from "node:events";
import { createServer } from "node:net";
import { scannerServer, scanBytes } from "../apps/scanner/server.mjs";
const bytes = Buffer.from("Synthetic document");
const checksum = createHash("sha256").update(bytes).digest("hex");
const fresh = () =>
  `ClamAV 1.5.4/99999/${new Date().toUTCString().replace(" GMT", "")}| COMMANDS: INSTREAM PING VERSIONCOMMANDS`;
it("streams actual INSTREAM framing to a daemon socket and accepts only its complete clean reply", async () => {
  let streamed = Buffer.alloc(0);
  const daemon = createServer((socket) => {
    let input = Buffer.alloc(0);
    socket.on("data", (data) => {
      input = Buffer.concat([input, data]);
      if (input.includes(Buffer.from("zVERSIONCOMMANDS\0"))) {
        socket.end(fresh() + "\0");
        return;
      }
      const command = Buffer.from("zINSTREAM\0");
      if (
        input.length < command.length ||
        !input.subarray(0, command.length).equals(command)
      )
        return;
      let offset = command.length;
      const chunks = [];
      while (input.length >= offset + 4) {
        const length = input.readUInt32BE(offset);
        offset += 4;
        if (input.length < offset + length) return;
        if (length === 0) {
          streamed = Buffer.concat(chunks);
          socket.end("stream: OK\0");
          return;
        }
        chunks.push(input.subarray(offset, offset + length));
        offset += length;
      }
    });
  });
  daemon.listen(0, "127.0.0.1");
  await once(daemon, "listening");
  try {
    expect(
      await scanBytes(bytes, {
        daemon: { host: "127.0.0.1", port: daemon.address().port },
      }),
    ).toEqual({ checksum, verdict: "clean" });
    expect(streamed).toEqual(bytes);
  } finally {
    await new Promise((r) => daemon.close(r));
  }
});
it("rejects stale signatures, ambiguous replies and limits; an infection stays infected", async () => {
  const exchange = async (_options, command) =>
    command === "VERSIONCOMMANDS" ? fresh() : "stream: Eicar-Signature FOUND";
  expect((await scanBytes(bytes, { exchange })).verdict).toBe("infected");
  for (const bad of [
    "stream: NOT OK",
    "INSTREAM size limit exceeded ERROR",
    "stream: OK but incomplete",
  ]) {
    await expect(
      scanBytes(bytes, {
        exchange: async (_o, c) => (c === "VERSIONCOMMANDS" ? fresh() : bad),
      }),
    ).rejects.toThrow("SCANNER_INCOMPLETE_OR_LIMITED_SCAN");
  }
  await expect(
    scanBytes(bytes, {
      exchange: async () =>
        "ClamAV 1.5.4/99999/Mon Jan 01 00:00:00 2020| COMMANDS: INSTREAM",
    }),
  ).rejects.toThrow("SCANNER_SIGNATURES_STALE_OR_UNKNOWN");
});
it("authenticates before scanning, verifies the hash and returns no private daemon error", async () => {
  const secret = randomUUID();
  let calls = 0;
  const server = scannerServer({
    secret,
    scan: async () => {
      calls++;
      return { checksum, verdict: "clean" };
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/scan`;
  const headers = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/octet-stream",
    "X-SHA256": checksum,
  };
  try {
    expect((await fetch(url, { method: "POST", body: bytes })).status).toBe(
      401,
    );
    expect(calls).toBe(0);
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { ...headers, "X-SHA256": "0".repeat(64) },
          body: bytes,
        })
      ).status,
    ).toBe(409);
    expect(calls).toBe(0);
    const result = await fetch(url, { method: "POST", headers, body: bytes });
    expect(await result.json()).toEqual({ checksum, verdict: "clean" });
    expect(calls).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
it("fails closed when its daemon is unavailable and refuses weak gateway credentials", async () => {
  expect(() => scannerServer({ secret: "short" })).toThrow("at least 32");
  const secret = randomUUID();
  const server = scannerServer({
    secret,
    scan: async () => {
      throw Error("private-daemon-sentinel");
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/scan`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/octet-stream",
        "X-SHA256": checksum,
      },
      body: bytes,
    });
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("private-daemon-sentinel");
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
it("rejects expanded archive limits and falsified directory sizes independently of engine heuristics", async () => {
  const { zipSync } = await import("fflate");
  const { verifyArchive } = await import("../apps/scanner/archive.mjs");
  const archive = Buffer.from(
    zipSync({ "large.txt": Buffer.alloc(21 * 1024 * 1024, 65) }),
  );
  expect(() => verifyArchive(archive)).toThrow("SCANNER_ARCHIVE_LIMIT");
  const tampered = Buffer.from(archive);
  const central = tampered.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  tampered.writeUInt32LE(1, central + 24);
  expect(() => verifyArchive(tampered)).toThrow(
    "SCANNER_ARCHIVE_INVALID_OR_LIMITED",
  );
  const valid = Buffer.from(zipSync({ "small.txt": Buffer.from("allowed") }));
  expect(() => verifyArchive(valid)).not.toThrow();
});

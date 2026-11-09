import { afterEach, expect, it, vi } from "vitest";
import { consume } from "../apps/api/src/jobs";
import type { Env } from "../apps/api/src/platform";
import { uid } from "./fixtures";
afterEach(() => vi.unstubAllGlobals());
async function exercise(
  options: {
    checksumMismatch?: boolean;
    revokedAfterWrite?: boolean;
    redelivery?: boolean;
  } = {},
) {
  const school = uid(3),
    key = `${school}/publications/${uid(4)}/${uid(5)}`;
  const bytes = new TextEncoder().encode("Synthetic approved file");
  const checksum = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const name = new URL(url).pathname.split("/").at(-1)!;
      calls.push({ name, body: JSON.parse(String(init.body)).p });
      if (name === "runtime_claim")
        return Response.json(
          options.redelivery
            ? null
            : {
                id: uid(1),
                runToken: uid(2),
                kind: "asset_copy",
                schoolId: school,
                attempts: 1,
                payload: { assetId: uid(5) },
                data: null,
              },
        );
      if (name === "runtime_asset_plan")
        return Response.json({
          id: uid(5),
          objectKey: key,
          sourceKey: `${school}/source`,
          checksum: options.checksumMismatch ? "invalid" : checksum,
          size: bytes.length,
          type: "application/pdf",
        });
      if (name === "runtime_asset_finish")
        return Response.json(!options.revokedAfterWrite);
      if (name === "runtime_finish") return Response.json(null);
      throw Error("Unexpected provider call");
    }),
  );
  const files = {
    get: vi.fn(async () => ({
      size: bytes.length,
      arrayBuffer: async () => bytes.buffer,
    })),
    put: vi.fn(async (key: string, bytes: ArrayBuffer, metadata: unknown) => ({
      key,
      bytes,
      metadata,
    })),
    delete: vi.fn(async () => {}),
  };
  const ack = vi.fn(),
    retry = vi.fn();
  await consume(
    {
      messages: [{ body: { id: uid(1), kind: "asset_copy" }, ack, retry }],
    } as unknown as MessageBatch<{ id: string; kind: string }>,
    {
      SUPABASE_URL: "https://synthetic.invalid",
      SUPABASE_ANON_KEY: "synthetic",
      SUPABASE_SERVICE_ROLE_KEY: "synthetic",
      FILES: files,
    } as unknown as Env,
  );
  return { calls, files, ack, retry, key };
}
it("copies only checksum-verified bytes to a separate private publication object", async () => {
  const r = await exercise();
  expect(r.files.put).toHaveBeenCalledOnce();
  expect(r.files.put.mock.calls[0][0]).toBe(r.key);
  expect(r.calls.at(-1)).toMatchObject({
    name: "runtime_finish",
    body: { status: "done" },
  });
  expect(r.ack).toHaveBeenCalledOnce();
});
it("rejects a changed source without copying or publishing it", async () => {
  const r = await exercise({ checksumMismatch: true });
  expect(r.files.put).not.toHaveBeenCalled();
  expect(r.calls.at(-1)).toMatchObject({
    body: { status: "pending", errorCode: "ASSET_CHECKSUM_MISMATCH" },
  });
});
it("deletes a copy whose publication was revoked before completion", async () => {
  const r = await exercise({ revokedAfterWrite: true });
  expect(r.files.put).toHaveBeenCalledOnce();
  expect(r.files.delete).toHaveBeenCalledWith(r.key);
});
it("acknowledges an already-claimed redelivery without storage work", async () => {
  const r = await exercise({ redelivery: true });
  expect(r.files.get).not.toHaveBeenCalled();
  expect(r.files.put).not.toHaveBeenCalled();
  expect(r.ack).toHaveBeenCalledOnce();
});

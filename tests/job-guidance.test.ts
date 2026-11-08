import { afterEach, expect, it, vi } from "vitest";
import { consume } from "../apps/api/src/jobs";
import type { Env } from "../apps/api/src/platform";
import { uid } from "./fixtures";
afterEach(() => vi.unstubAllGlobals());
it("reports insufficient evidence without invoking an AI provider or inventing guidance", async () => {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const name = new URL(url).pathname.split("/").at(-1)!;
      calls.push({ name, body: JSON.parse(String(init.body)).p });
      if (name === "runtime_claim")
        return Response.json({
          id: uid(1),
          runToken: uid(2),
          kind: "insight",
          schoolId: uid(3),
          attempts: 1,
          payload: {},
          data: { sourceVersion: 4, results: [], fingerprint: "synthetic" },
        });
      if (name === "runtime_finish") return Response.json(null);
      throw Error("Unexpected provider or database call");
    }),
  );
  const ack = vi.fn(),
    retry = vi.fn();
  await consume(
    {
      messages: [{ body: { id: uid(1), kind: "insight" }, ack, retry }],
    } as unknown as MessageBatch<{ id: string; kind: string }>,
    {
      SUPABASE_URL: "https://synthetic.invalid",
      SUPABASE_ANON_KEY: "synthetic",
      SUPABASE_SERVICE_ROLE_KEY: "synthetic",
    } as Env,
  );
  expect(calls.map((c) => c.name)).toEqual(["runtime_claim", "runtime_finish"]);
  expect(calls[1].body).toMatchObject({
    status: "unavailable",
    errorCode: "INSUFFICIENT_EVIDENCE",
    sourceVersion: 4,
  });
  expect(calls[1].body.result).toBeUndefined();
  expect(ack).toHaveBeenCalledOnce();
  expect(retry).not.toHaveBeenCalled();
});

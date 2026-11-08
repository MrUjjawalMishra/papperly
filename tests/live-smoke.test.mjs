import { expect, it } from "vitest";
import { verifyLiveSmoke } from "../scripts/live-smoke.mjs";
const expectedRelease = "a".repeat(40);
const target = { base: "https://staging.example.invalid", expectedRelease };
const ready = (url) =>
  Response.json({
    status: url.pathname === "/healthz" ? "ok" : "ready",
    release: expectedRelease,
  });
it("tolerates bounded initial edge propagation and still requires exact identity and private-route denial", async () => {
  let calls = 0,
    pauses = 0;
  const checks = await verifyLiveSmoke(
    target,
    async (url) => {
      calls++;
      if (calls === 1) return new Response("not propagated", { status: 404 });
      if (url.pathname === "/v1/results")
        return new Response(null, { status: 401 });
      return ready(url);
    },
    async () => {
      pauses++;
    },
  );
  expect(checks[0].attempts).toBe(2);
  expect(checks[2].status).toBe(401);
  expect(pauses).toBe(1);
});
it("fails after six persistent 404s without declaring readiness", async () => {
  let calls = 0;
  await expect(
    verifyLiveSmoke(
      target,
      async () => {
        calls++;
        return new Response(null, { status: 404 });
      },
      async () => {},
    ),
  ).rejects.toThrow("bounded propagation");
  expect(calls).toBe(6);
});
it("never accepts an old release SHA or a publicly accessible protected route", async () => {
  await expect(
    verifyLiveSmoke(
      target,
      async () => Response.json({ status: "ok", release: "b".repeat(40) }),
      async () => {},
    ),
  ).rejects.toThrow("Release SHA");
  await expect(
    verifyLiveSmoke(
      target,
      async (url) =>
        url.pathname === "/v1/results"
          ? new Response(null, { status: 200 })
          : ready(url),
      async () => {},
    ),
  ).rejects.toThrow("not denied");
});

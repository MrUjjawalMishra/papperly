import { afterEach, expect, it, vi } from "vitest";
import { provision } from "../apps/api/src/accounts";
import type { Env, Session } from "../apps/api/src/platform";
const id = "a0000000-0000-4000-8000-000000000001";
const env = {
  SUPABASE_URL: "https://provider.test",
  SUPABASE_ANON_KEY: "public-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  AUTH_ALIAS_DOMAIN: "synthetic.invalid",
} as Env;
const actor = { accessToken: "synthetic-user-session" } as Session;
const input = {
  role: "teacher",
  identityKey: "synthetic-teacher",
  name: "Synthetic Teacher",
  loginId: "synthetic.teacher",
};
afterEach(() => vi.unstubAllGlobals());
function mockProvider(
  lookupStatus: number,
  createdId = id,
  state = "reserved",
) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push(`${options.method} ${path}`);
    if (path.endsWith("/reserve_account"))
      return Response.json({ id, state, loginId: input.loginId });
    if (path.endsWith("/runtime_provision_claim"))
      return Response.json({ id, state: "reserved", details: input });
    if (path === `/auth/v1/admin/users/${id}`)
      return lookupStatus === 200
        ? Response.json({ id })
        : Response.json(
            { message: "Provider rejection" },
            { status: lookupStatus },
          );
    if (path === "/auth/v1/admin/users")
      return Response.json({ id: createdId });
    if (path.startsWith("/rest/v1/rpc/runtime_provision_"))
      return Response.json(null);
    throw Error("Unexpected provider route");
  });
  return calls;
}
it("does not treat rejected or conflicting Auth lookups as a missing user", async () => {
  for (const status of [401, 403, 409, 503]) {
    const calls = mockProvider(status);
    await expect(provision(env, actor, input)).rejects.toHaveProperty(
      "upstreamStatus",
      status,
    );
    expect(calls).not.toContain("POST /auth/v1/admin/users");
    expect(calls).not.toContain("POST /rest/v1/rpc/runtime_provision_activate");
  }
});
it("refuses to activate a provider identity different from the reserved immutable ID", async () => {
  const calls = mockProvider(404, "a0000000-0000-4000-8000-000000000002");
  await expect(provision(env, actor, input)).rejects.toHaveProperty(
    "code",
    "AUTH_IDENTITY_MISMATCH",
  );
  expect(calls).not.toContain("POST /rest/v1/rpc/runtime_provision_activate");
});
it("issues credentials only for a newly created identity and does not reissue on retry", async () => {
  mockProvider(404);
  const created = await provision(env, actor, input);
  expect(created.state).toBe("active");
  expect(created).toHaveProperty("issuedPassword");
  const calls = mockProvider(200, id, "active");
  const retry = await provision(env, actor, input);
  expect(retry).not.toHaveProperty("issuedPassword");
  expect(calls).toEqual(["POST /rest/v1/rpc/reserve_account"]);
});

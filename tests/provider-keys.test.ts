import { afterEach, expect, it, vi } from "vitest";
import { supabase, type Env } from "../apps/api/src/platform";
afterEach(() => vi.unstubAllGlobals());
it("sends modern publishable keys as apikey without treating them as JWTs", async () => {
  const publicKey = "sb_publishable_" + crypto.randomUUID();
  const env = {
    SUPABASE_URL: "https://provider.test",
    SUPABASE_ANON_KEY: publicKey,
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_" + crypto.randomUUID(),
  } as Env;
  let observed: Headers | undefined;
  const fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
    observed = new Headers(init?.headers);
    return Response.json([]);
  });
  vi.stubGlobal("fetch", fetch);
  await supabase(env, "/rest/v1/rpc/directory", publicKey, { p: {} });
  const headers = observed!;
  expect(headers.get("apikey")).toBe(publicKey);
  expect(headers.has("Authorization")).toBe(false);
});
it("uses the server secret only for privileged calls and preserves user JWT authorization", async () => {
  const publicKey = "sb_publishable_" + crypto.randomUUID(),
    secretKey = "sb_secret_" + crypto.randomUUID();
  const env = {
    SUPABASE_URL: "https://provider.test",
    SUPABASE_ANON_KEY: publicKey,
    SUPABASE_SERVICE_ROLE_KEY: secretKey,
  } as Env;
  const seen: Headers[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, options: RequestInit) => {
    seen.push(new Headers(options.headers));
    return Response.json({});
  });
  await supabase(env, "/rest/v1/rpc/runtime_session", secretKey, { p: {} });
  await supabase(env, "/rest/v1/results", "synthetic-user-jwt");
  expect(seen[0].get("apikey")).toBe(secretKey);
  expect(seen[0].has("Authorization")).toBe(false);
  expect(seen[1].get("apikey")).toBe(publicKey);
  expect(seen[1].get("Authorization")).toBe("Bearer synthetic-user-jwt");
});

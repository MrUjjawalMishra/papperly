import { afterEach, expect, it, vi } from "vitest";
import {
  authProvider,
  authFailure,
  trustedClientAddress,
  ApiError,
  type Env,
} from "../apps/api/src/platform";
const env = {
  SUPABASE_URL: "https://provider.test",
  SUPABASE_ANON_KEY: "sb_publishable_" + crypto.randomUUID(),
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_" + crypto.randomUUID(),
  AUTH_IP_FORWARDING: "true",
} as Env;
afterEach(() => vi.unstubAllGlobals());
it("forwards only a verified Cloudflare client address with a server Secret key", async () => {
  let seen: Headers | undefined;
  vi.stubGlobal("fetch", async (_url: unknown, options: RequestInit) => {
    seen = new Headers(options.headers);
    return Response.json({});
  });
  const request = new Request("https://api.test", {
    headers: {
      "CF-Connecting-IP": "203.0.113.10",
      "X-Forwarded-For": "198.51.100.99",
    },
  });
  await authProvider(
    env,
    "/auth/v1/token?grant_type=password",
    {},
    trustedClientAddress(request),
  );
  expect(seen!.get("apikey")).toBe(env.SUPABASE_SERVICE_ROLE_KEY);
  expect(seen!.get("sb-forwarded-for")).toBe("203.0.113.10");
  expect(seen!.has("Authorization")).toBe(false);
  expect(
    trustedClientAddress(
      new Request("https://api.test", {
        headers: { "X-Forwarded-For": "203.0.113.10" },
      }),
    ),
  ).toBeUndefined();
});
it("rejects malformed addresses and fails closed when forwarding lacks a modern server key", async () => {
  for (const ip of [
    "1.2.3.999",
    "1.2.3.4,5.6.7.8",
    "1:2:3:4:5:6:7:8:",
    "1:::2",
  ])
    expect(
      trustedClientAddress(
        new Request("https://api.test", {
          headers: { "CF-Connecting-IP": ip },
        }),
      ),
    ).toBeUndefined();
  for (const ip of ["2001:db8::1", "::1", "203.0.113.10"])
    expect(
      trustedClientAddress(
        new Request("https://api.test", {
          headers: { "CF-Connecting-IP": ip },
        }),
      ),
    ).toBe(ip);
  expect(() =>
    authProvider(
      { ...env, SUPABASE_SERVICE_ROLE_KEY: "legacy-test" },
      "/auth/v1/token",
      {},
      "203.0.113.10",
    ),
  ).toThrow("AUTH_FORWARDING_UNAVAILABLE");
});
it("preserves provider throttling and Retry-After instead of reporting invalid credentials", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json(
      { message: "not logged" },
      { status: 429, headers: { "Retry-After": "2" } },
    ),
  );
  try {
    await authProvider(env, "/auth/v1/token", {}, "203.0.113.10");
    throw Error("must reject");
  } catch (error) {
    const mapped = authFailure(error);
    expect(mapped.status).toBe(429);
    expect(mapped.retryAfterSeconds).toBe(2);
  }
  expect(
    authFailure(new ApiError(409, "Invalid login credentials", "", 400)).status,
  ).toBe(401);
  expect(
    authFailure(new ApiError(409, "Invalid API key", "", 401)).status,
  ).toBe(503);
  expect(authFailure(new TypeError("fetch failed")).status).toBe(503);
});

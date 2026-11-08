import { beforeAll, afterAll, it, expect, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { handle } from "../apps/api/src/index";
import { database, ids } from "./database";
import type { Env } from "../apps/api/src/platform";
let db: PGlite;
const env = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SESSION_ENCRYPTION_KEY: btoa("x".repeat(32)),
  AUTH_ALIAS_DOMAIN: "auth.test",
  OWNER_USER_ID: ids.owner,
  ALLOWED_ORIGINS: "https://app.test",
  ENVIRONMENT: "development",
  FILES: {},
  JOBS: {},
} as Env;
const testPassword = "Synthetic" + crypto.randomUUID().replaceAll("-", "");
let providerPassword = testPassword.toLowerCase();
const request = (
  path: string,
  p?: unknown,
  cookie?: string,
  csrf?: string,
  origin = "https://app.test",
) =>
  new Request("https://api.test" + path, {
    method: p === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      "Content-Type": "application/json",
    },
    body: p === undefined ? undefined : JSON.stringify(p),
  });
beforeAll(async () => {
  db = await database();
  await db.query(
    "insert into private.login_identifiers values($1,'student.9b15','Student.9B15',$2,true)",
    [ids.school, ids.student],
  );
  await db.query(
    "update memberships set credential_policy='name-roster-ascii-fold-v1'where id=$1",
    [ids.student],
  );
  vi.stubGlobal(
    "fetch",
    async (input: string | Request | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const p = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      if (url.pathname === "/auth/v1/token") {
        if (p.password !== providerPassword)
          return Response.json({ message: "invalid" }, { status: 400 });
        return Response.json({
          access_token: ids.student,
          refresh_token: "test-only",
          expires_at: Date.now() / 1000 + 3600,
        });
      }
      if (
        url.pathname === `/auth/v1/admin/users/${ids.student}` &&
        init?.method === "PUT"
      ) {
        providerPassword = String(p.password);
        return Response.json({ id: ids.student });
      }
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.split("/").pop()!;
        const token = new Headers(init?.headers).get("Authorization")?.slice(7);
        try {
          await db.exec(
            token === env.SUPABASE_SERVICE_ROLE_KEY
              ? "reset role"
              : "set role authenticated",
          );
          await db.query(
            "select set_config('request.jwt.claim.sub',$1,false)",
            [token === env.SUPABASE_SERVICE_ROLE_KEY ? "" : token],
          );
          const rows = await db.query<{ data: unknown }>(
            `select public.${name}($1::jsonb)as data`,
            [JSON.stringify(p.p)],
          );
          return Response.json(rows.rows[0].data ?? null);
        } catch (e) {
          return Response.json(
            { message: e instanceof Error ? e.message : "failure" },
            { status: 403 },
          );
        } finally {
          await db.exec("reset role");
        }
      }
      throw Error("Unexpected mock request " + url.pathname);
    },
  );
}, 60000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await db?.close();
});
it("health has no secrets; readiness fails when not configured", async () => {
  expect(await (await handle(request("/healthz"), {} as Env)).json()).toEqual({
    status: "ok",
    release: "local",
  });
  expect((await handle(request("/readyz"), {} as Env)).status).toBe(503);
});
it("rejects untrusted login origins and generic invalid credentials", async () => {
  expect(
    (
      await handle(
        request(
          "/v1/auth/login",
          {
            schoolCode: "oak",
            loginId: "student.9b15",
            password: testPassword,
          },
          undefined,
          undefined,
          "https://evil.test",
        ),
        env,
      )
    ).status,
  ).toBe(403);
  const bad = await handle(
    request("/v1/auth/login", {
      schoolCode: "oak",
      loginId: "absent",
      password: testPassword,
    }),
    env,
  );
  expect(bad.status).toBe(401);
  expect(((await bad.json()) as { error: { code: string } }).error.code).toBe(
    "INVALID_CREDENTIALS",
  );
});
it("logs in via student-only canonicalization, persists secure sessions, rejects CSRF, and revokes logout", async () => {
  const response = await handle(
    request("/v1/auth/login", {
      schoolCode: "oak",
      loginId: "STUDENT.9B15",
      password: testPassword.toUpperCase(),
    }),
    env,
  );
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("Set-Cookie")!;
  expect(setCookie).toContain("Secure; HttpOnly; SameSite=Strict; Path=/");
  expect(setCookie).not.toContain("Max-Age");
  const cookie = setCookie.split(";")[0];
  const data = (await response.json()) as { csrfToken: string };
  const resumed = await handle(
    request("/v1/auth/session", undefined, cookie),
    env,
  );
  expect(resumed.status).toBe(200);
  expect(((await resumed.json()) as { user: { id: string } }).user.id).toBe(
    ids.student,
  );
  expect(
    (await handle(request("/v1/auth/logout", {}, cookie), env)).status,
  ).toBe(403);
  expect(
    (await handle(request("/v1/auth/logout", {}, cookie, data.csrfToken), env))
      .status,
  ).toBe(200);
  expect(
    (await handle(request("/v1/auth/session", undefined, cookie), env)).status,
  ).toBe(401);
});
it("self password change sets a fresh HttpOnly cookie, hides internal cookie data and invalidates the old session", async () => {
  const logged = await handle(
    request("/v1/auth/login", {
      schoolCode: "oak",
      loginId: "student.9b15",
      password: testPassword,
    }),
    env,
  );
  const originalCookie = logged.headers.get("Set-Cookie")!.split(";")[0];
  const { csrfToken } = (await logged.json()) as { csrfToken: string };
  const changed = await handle(
    request(
      "/v1/auth/password",
      {
        userId: ids.student,
        currentPassword: testPassword,
        newPassword: "Changed" + crypto.randomUUID().replaceAll("-", ""),
        reason: "Synthetic self change",
      },
      originalCookie,
      csrfToken,
    ),
    env,
  );
  expect(changed.status).toBe(200);
  const cookieHeader = changed.headers.get("Set-Cookie")!;
  expect(cookieHeader).toContain("HttpOnly");
  const newCookie = cookieHeader.split(";")[0];
  expect(newCookie).not.toBe(originalCookie);
  const payload = (await changed.json()) as {
    data: { csrfToken: string; _cookie?: string };
  };
  expect(payload.data._cookie).toBeUndefined();
  expect(payload.data.csrfToken).not.toBe(csrfToken);
  expect(
    (await handle(request("/v1/auth/session", undefined, originalCookie), env))
      .status,
  ).toBe(401);
  expect(
    (await handle(request("/v1/auth/session", undefined, newCookie), env))
      .status,
  ).toBe(200);
});

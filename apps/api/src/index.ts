import { z, ZodError } from "zod";
import { login, uuid } from "../../../packages/contracts/src/index";
import {
  authLoginResponse,
  authSessionResponse,
  passwordChangeResponse,
  reauthenticationInput,
  accountProvisionResponse,
  importConfirmationResponse,
} from "../../../packages/contracts/src/auth";
import { validatePaper } from "../../../packages/domain/src/index";
import {
  ApiError,
  rpc,
  supabase,
  session,
  csrf,
  limited,
  hash,
  seal,
  randomToken,
  type Env,
  type Tokens,
  authProvider,
  trustedClientAddress,
  authFailure,
} from "./platform";
import { operations, readTables } from "./routes";
import { canonicalPassword } from "../../../packages/domain/src/credentials";
import { provision, credentialChange, reauthenticate } from "./accounts";
import { upload } from "./files";
import { importPreview, importConfirm, rosterTemplate } from "./imports";
import { consume, scheduled } from "./jobs";
async function body(request: Request) {
  if (Number(request.headers.get("Content-Length") ?? 0) > 1048576)
    throw new ApiError(413, "PAYLOAD_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "BODY_REQUIRED");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 1048576) {
      await reader.cancel();
      throw new ApiError(413, "PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new ApiError(400, "INVALID_JSON");
  }
}
export async function handle(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": requestId,
    "Referrer-Policy": "no-referrer",
  });
  const origin = request.headers.get("Origin");
  if (origin && env.ALLOWED_ORIGINS?.split(",").includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Expose-Headers", "X-Request-ID,Retry-After");
  }
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  const contractJson = (schema: z.ZodType, data: unknown) => {
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new ApiError(500, "RESPONSE_VALIDATION_FAILED");
    return json(parsed.data);
  };
  try {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      if (!origin || !env.ALLOWED_ORIGINS?.split(",").includes(origin))
        throw new ApiError(403, "ORIGIN_REJECTED");
      headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type,X-CSRF-Token,Idempotency-Key,X-Filename",
      );
      return new Response(null, { status: 204, headers });
    }
    if (url.pathname === "/healthz")
      return json({ status: "ok", release: env.RELEASE_SHA ?? "local" });
    if (url.pathname === "/readyz") {
      if (
        !env.SUPABASE_URL ||
        !env.SESSION_ENCRYPTION_KEY ||
        !env.FILES ||
        !env.JOBS
      )
        throw new ApiError(503, "NOT_CONFIGURED");
      await rpc(env, "runtime_rate", { key: "readiness", limit: 100000 });
      return json({
        status: "ready",
        environment: env.ENVIRONMENT,
        release: env.RELEASE_SHA ?? "local",
        ai: env.AI_ENDPOINT ? "configured-unverified" : "unavailable",
        scanning: "unavailable",
      });
    }
    if (!url.pathname.startsWith("/v1/")) throw new ApiError(404, "NOT_FOUND");
    if (
      ["/v1/auth/login", "/v1/auth/owner-login"].includes(url.pathname) &&
      request.method === "POST"
    ) {
      if (!origin || !env.ALLOWED_ORIGINS.split(",").includes(origin))
        throw new ApiError(403, "ORIGIN_REJECTED");
      const input = login.parse(await body(request));
      await limited(
        request,
        env,
        "login:" +
          input.schoolCode.toLowerCase() +
          ":" +
          input.loginId.toLowerCase(),
        5,
      );
      const owner = url.pathname === "/v1/auth/owner-login";
      const user = await rpc<{
        id: string;
        credentialVersion: number;
        role: string;
        policy: string;
      } | null>(
        env,
        owner ? "runtime_owner_lookup" : "runtime_login_lookup",
        owner
          ? { userId: env.OWNER_USER_ID }
          : { schoolCode: input.schoolCode, loginId: input.loginId },
      );
      if (!user) throw new ApiError(401, "INVALID_CREDENTIALS");
      let tokens: Tokens;
      try {
        tokens = (await authProvider(
          env,
          "/auth/v1/token?grant_type=password",
          {
            email: `${user.id}@${env.AUTH_ALIAS_DOMAIN}`,
            password: canonicalPassword(input.password, user.role, user.policy),
          },
          trustedClientAddress(request),
        )) as Tokens;
      } catch (e) {
        throw authFailure(e);
      }
      const opaque = randomToken(),
        csrfToken = randomToken();
      await rpc(env, "runtime_session_create", {
        hash: await hash(opaque),
        userId: user.id,
        tokens: await seal(env, {
          ...tokens,
          csrf_token: csrfToken,
          expires_at: tokens.expires_at ?? Date.now() / 1000 + 3600,
        }),
        csrfHash: await hash(csrfToken),
        credentialVersion: user.credentialVersion,
      });
      headers.append(
        "Set-Cookie",
        `__Host-papperly=${opaque}; Secure; HttpOnly; SameSite=Strict; Path=/`,
      );
      return contractJson(authLoginResponse, {
        user: { id: user.id, role: user.role },
        csrfToken,
      });
    }
    if (url.pathname === "/v1/public/directory" && request.method === "GET") {
      await limited(request, env, "public-directory", 30);
      const p = operations["directory/search"].schema.parse({
        q: url.searchParams.get("q") ?? "",
        limit: Number(url.searchParams.get("limit") ?? 25),
        offset: Number(url.searchParams.get("offset") ?? 0),
      });
      headers.set("X-Robots-Tag", "noindex");
      return json({
        data: await rpc(
          env,
          "directory",
          p,
          request.headers.get("Cookie")?.includes("__Host-papperly=")
            ? (await session(request, env)).accessToken
            : env.SUPABASE_ANON_KEY,
        ),
      });
    }
    if (
      url.pathname.startsWith("/v1/public/profiles/") &&
      request.method === "GET"
    ) {
      await limited(request, env, "public-profile", 30);
      headers.set("X-Robots-Tag", "noindex");
      return json({
        data: await rpc(
          env,
          "profile_detail",
          { profileId: uuid.parse(url.pathname.slice(20)) },
          request.headers.get("Cookie")?.includes("__Host-papperly=")
            ? (await session(request, env)).accessToken
            : env.SUPABASE_ANON_KEY,
        ),
      });
    }
    const s = await session(request, env);
    await limited(request, env, "api:" + s.userId, 180);
    if (request.method !== "GET") await csrf(request, env, s);
    if (url.pathname === "/v1/auth/session" && request.method === "GET")
      return contractJson(authSessionResponse, {
        user: { id: s.userId, role: s.role },
        expiresAt: s.expiresAt,
        csrfToken: s.csrfToken,
        mustChangePassword: s.mustChangePassword,
      });
    if (url.pathname === "/v1/auth/logout" && request.method === "POST") {
      await rpc(env, "runtime_session_revoke", { hash: s.hash });
      headers.append(
        "Set-Cookie",
        "__Host-papperly=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      );
      return json({ ok: true });
    }
    if (url.pathname === "/v1/auth/password" && request.method === "POST") {
      const { _cookie, ...data } = await credentialChange(
        env,
        s,
        await body(request),
        trustedClientAddress(request),
      );
      if (_cookie) headers.append("Set-Cookie", _cookie);
      return contractJson(passwordChangeResponse, { data });
    }
    if (
      url.pathname === "/v1/auth/reauthenticate" &&
      request.method === "POST"
    ) {
      const p = reauthenticationInput.parse(await body(request));
      await reauthenticate(env, s, p.password, trustedClientAddress(request));
      return json({ ok: true });
    }
    if (s.mustChangePassword)
      throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED");
    if (url.pathname === "/v1/accounts" && request.method === "POST")
      return contractJson(accountProvisionResponse, {
        data: await provision(env, s, await body(request)),
      });
    const route = url.pathname.slice(4);
    if (route === "attempts/takeover" && request.method === "POST") {
      const p = z
        .object({
          attemptId: uuid,
          writer: uuid,
          password: z.string().max(256),
        })
        .strict()
        .parse(await body(request));
      await reauthenticate(env, s, p.password, trustedClientAddress(request));
      return json({
        data: await rpc(env, "runtime_takeover", {
          attemptId: p.attemptId,
          writer: p.writer,
          sessionHash: s.hash,
        }),
      });
    }
    if (route === "files/upload" && request.method === "POST")
      return json({ data: await upload(request, env, s) });
    if (route === "imports/template" && request.method === "GET") {
      headers.set(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      headers.set("Content-Disposition", "attachment; filename=roster.xlsx");
      return new Response(rosterTemplate(), { headers });
    }
    if (route === "imports/preview" && request.method === "POST")
      return json({ data: await importPreview(request, env, s) });
    if (route === "imports/confirm" && request.method === "POST")
      return contractJson(importConfirmationResponse, {
        data: await importConfirm(await body(request), env, s),
      });
    if (
      route === "support/metadata" &&
      Date.now() - Date.parse(s.reauthenticatedAt) > 300000
    )
      throw new ApiError(403, "RECENT_REAUTH_REQUIRED");
    if (request.method === "POST" && route in operations) {
      const op = operations[route as keyof typeof operations];
      const input = op.schema.parse(await body(request));
      if (op.rpc === "publish_exam") {
        const { classId: _, ...p } = input as z.infer<
          (typeof operations)["exams/publish"]["schema"]
        >;
        void _;
        validatePaper(p);
      }
      const result = await rpc<Record<string, unknown> | null>(
        env,
        op.rpc,
        input,
        s.accessToken,
      );
      if (result && typeof result === "object" && "error" in result)
        throw new ApiError(409, String(result.error));
      return json({ data: result });
    }
    if (request.method === "GET" && route in readTables) {
      const spec = readTables[route as keyof typeof readTables];
      const params = new URLSearchParams({
        select: spec.select,
        limit: String(
          z.coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .parse(url.searchParams.get("limit") ?? 25),
        ),
        offset: String(
          z.coerce
            .number()
            .int()
            .min(0)
            .max(10000)
            .parse(url.searchParams.get("offset") ?? 0),
        ),
      });
      for (const field of [
        "id",
        "version_id",
        "attempt_id",
        "group_id",
        "query_id",
        "article_id",
      ]) {
        const v = url.searchParams.get(field);
        if (v) {
          uuid.parse(v);
          if (!spec.select.split(",").includes(field))
            throw new ApiError(400, "INVALID_FILTER");
          params.set(field, `eq.${v}`);
        }
      }
      params.set("order", spec.select.split(",")[0] + ".asc");
      return json({
        data: await supabase(
          env,
          `/rest/v1/${spec.table}?${params}`,
          s.accessToken,
        ),
      });
    }
    if (route.startsWith("exports/") && request.method === "GET") {
      const id = uuid.parse(route.slice(8));
      const f = await rpc<{ objectKey: string }>(
        env,
        "export_download",
        { id },
        s.accessToken,
      );
      const file = await env.FILES.get(f.objectKey);
      if (!file) throw new ApiError(404, "EXPORT_UNAVAILABLE");
      headers.set("Content-Type", "text/csv; charset=utf-8");
      headers.set(
        "Content-Disposition",
        "attachment; filename=papperly-report.csv",
      );
      return new Response(file.body, { headers });
    }
    if (route.startsWith("files/") && request.method === "GET") {
      const id = uuid.parse(route.slice(6));
      const files = (await supabase(
        env,
        `/rest/v1/attachments?id=eq.${id}&select=object_key,filename,declared_type`,
        s.accessToken,
      )) as { object_key: string; filename: string; declared_type: string }[];
      if (!files.length) throw new ApiError(404, "FILE_UNAVAILABLE");
      const object = await env.FILES.get(files[0].object_key);
      if (!object) throw new ApiError(404, "FILE_UNAVAILABLE");
      headers.set("Content-Type", "application/octet-stream");
      headers.set(
        "Content-Disposition",
        `attachment; filename="${files[0].filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
      );
      return new Response(object.body, { headers });
    }
    if (
      route === "files/upload" ||
      route === "imports/confirm" ||
      route.startsWith("support/")
    )
      throw new ApiError(503, "FEATURE_NOT_CONFIGURED");
    throw new ApiError(404, "NOT_FOUND");
  } catch (e) {
    const error =
      e instanceof ApiError
        ? e
        : e instanceof ZodError
          ? new ApiError(400, "VALIDATION_FAILED")
          : new ApiError(500, "INTERNAL_ERROR");
    if (error.status === 429 && error.retryAfterSeconds)
      headers.set("Retry-After", String(error.retryAfterSeconds));
    return json(
      {
        error: {
          code: /^[A-Z_]+$/.test(error.code)
            ? error.code
            : "OPERATION_REJECTED",
          message: /^[A-Z_]+$/.test(error.code)
            ? error.code
            : "Operation rejected",
          requestId,
        },
      },
      error.status,
    );
  }
}
export default {
  fetch: handle,
  queue: consume,
  scheduled: async (
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) => ctx.waitUntil(scheduled(env)),
};

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SESSION_ENCRYPTION_KEY: string;
  AUTH_ALIAS_DOMAIN: string;
  ALLOWED_ORIGINS: string;
  OWNER_USER_ID?: string;
  AUTH_IP_FORWARDING?: "true" | "false";
  ENVIRONMENT: "development" | "staging" | "production";
  RELEASE_SHA?: string;
  SCANNER_ENDPOINT?: string;
  SCANNER_API_KEY?: string;
  AI_ENDPOINT?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  FILES: R2Bucket;
  JOBS: Queue<{ id: string; kind: string }>;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = code,
    public upstreamStatus?: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
export async function supabase(
  env: Env,
  path: string,
  token: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  extraHeaders: Record<string, string> = {},
) {
  const response = await fetch(env.SUPABASE_URL + path, {
    method,
    headers: {
      apikey:
        token === env.SUPABASE_SERVICE_ROLE_KEY
          ? env.SUPABASE_SERVICE_ROLE_KEY
          : env.SUPABASE_ANON_KEY,
      ...(/^(sb_publishable_|sb_secret_)/.test(token)
        ? {}
        : { Authorization: `Bearer ${token}` }),
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 429) {
      const retry = Number(response.headers.get("Retry-After") ?? 3);
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Upstream service rate limit",
        429,
        Number.isFinite(retry)
          ? Math.max(1, Math.min(300, Math.ceil(retry)))
          : 3,
      );
    }
    const code =
      typeof data === "object" && data !== null && "message" in data
        ? String(data.message)
        : "DATABASE_UNAVAILABLE";
    throw new ApiError(
      response.status === 403 || code === "FORBIDDEN"
        ? 403
        : response.status >= 500
          ? 503
          : 409,
      code,
      code,
      response.status,
    );
  }
  return data;
}
export function trustedClientAddress(request: Request) {
  // Cloudflare overwrites CF-Connecting-IP. Never trust client X-Forwarded-For.
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const parts = ip.split(".");
  if (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  )
    return ip;
  if (!/^[a-f0-9:]{2,39}$/i.test(ip)) return undefined;
  if (ip.includes(":::")) return undefined;
  const halves = ip.split("::"),
    groups = ip.split(":").filter(Boolean);
  if (
    groups.every((p) => p.length <= 4) &&
    (halves.length === 1
      ? groups.length === 8 && !ip.startsWith(":") && !ip.endsWith(":")
      : halves.length === 2 && groups.length < 8)
  )
    return ip;
  return undefined;
}
export function authFailure(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429) return error;
    if (
      [400, 401, 422].includes(error.upstreamStatus ?? 0) &&
      error.code !== "Invalid API key"
    )
      return new ApiError(401, "INVALID_CREDENTIALS");
  } else if (
    error instanceof Error &&
    ["STAFF_PASSWORD_LENGTH", "STUDENT_PASSWORD_ASCII_8_128_REQUIRED"].includes(
      error.message,
    )
  ) {
    return new ApiError(401, "INVALID_CREDENTIALS");
  }
  return new ApiError(503, "AUTH_UNAVAILABLE");
}
export function authProvider(
  env: Env,
  path: string,
  body: unknown,
  clientIp?: string,
) {
  const forwarding = env.AUTH_IP_FORWARDING === "true";
  if (
    forwarding &&
    (!clientIp || !env.SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_secret_"))
  )
    throw new ApiError(503, "AUTH_FORWARDING_UNAVAILABLE");
  return supabase(
    env,
    path,
    forwarding ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY,
    body,
    "POST",
    forwarding ? { "Sb-Forwarded-For": clientIp! } : {},
  );
}
export const rpc = async <T = unknown>(
  env: Env,
  name: string,
  p: unknown,
  token = env.SUPABASE_SERVICE_ROLE_KEY,
): Promise<T> =>
  (await supabase(env, `/rest/v1/rpc/${name}`, token, { p })) as T;
export const randomToken = () => {
  const a = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...a))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};
export async function hash(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
async function encryptionKey(env: Env) {
  const bytes = Uint8Array.from(atob(env.SESSION_ENCRYPTION_KEY), (c) =>
    c.charCodeAt(0),
  );
  if (bytes.length !== 32) throw new ApiError(503, "INVALID_SESSION_KEY");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function seal(env: Env, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return btoa(String.fromCharCode(...iv, ...new Uint8Array(ct)));
}
export async function unseal<T>(env: Env, value: string): Promise<T> {
  const raw = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: raw.slice(0, 12) },
        await encryptionKey(env),
        raw.slice(12),
      ),
    ),
  ) as T;
}
export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  csrf_token?: string;
}
interface SessionRow {
  userId: string;
  schoolId: string;
  role: string;
  tokens: string;
  csrfHash: string;
  expiresAt: string;
  reauthenticatedAt: string;
  mustChangePassword: boolean;
}
export interface Session extends SessionRow {
  accessToken: string;
  csrfToken?: string;
  hash: string;
}
export async function session(request: Request, env: Env): Promise<Session> {
  const token = request.headers
    .get("Cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("__Host-papperly="))
    ?.slice(16);
  if (!token) throw new ApiError(401, "UNAUTHENTICATED");
  const digest = await hash(token);
  const row = await rpc<SessionRow | null>(env, "runtime_session", {
    hash: digest,
  });
  if (!row) throw new ApiError(401, "SESSION_EXPIRED");
  let tokens = await unseal<Tokens>(env, row.tokens);
  if (tokens.expires_at <= Date.now() / 1000 + 60) {
    const refreshed = (await authProvider(
      env,
      "/auth/v1/token?grant_type=refresh_token",
      { refresh_token: tokens.refresh_token },
      trustedClientAddress(request),
    )) as Tokens;
    tokens = {
      ...refreshed,
      csrf_token: tokens.csrf_token,
      expires_at: refreshed.expires_at ?? Date.now() / 1000 + 3600,
    };
    await rpc(env, "runtime_session_refresh", {
      hash: digest,
      tokens: await seal(env, tokens),
    });
  }
  return {
    ...row,
    hash: digest,
    accessToken: tokens.access_token,
    csrfToken: tokens.csrf_token,
  };
}
export async function csrf(request: Request, env: Env, s: Session) {
  const origin = request.headers.get("Origin");
  if (
    !origin ||
    !env.ALLOWED_ORIGINS.split(",").includes(origin) ||
    (await hash(request.headers.get("X-CSRF-Token") ?? "")) !== s.csrfHash
  )
    throw new ApiError(403, "CSRF_REJECTED");
}
export async function limited(
  request: Request,
  env: Env,
  key: string,
  limit: number,
) {
  const allowed = await rpc<boolean>(env, "runtime_rate", {
    key: await hash(
      key + ":" + (request.headers.get("CF-Connecting-IP") ?? "local"),
    ),
    limit,
  });
  if (!allowed) throw new ApiError(429, "RATE_LIMITED");
}

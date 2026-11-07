export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SESSION_ENCRYPTION_KEY: string;
  AUTH_ALIAS_DOMAIN: string;
  ALLOWED_ORIGINS: string;
  OWNER_USER_ID?: string;
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
) {
  const response = await fetch(env.SUPABASE_URL + path, {
    method,
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
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
    );
  }
  return data;
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
    const refreshed = (await supabase(
      env,
      "/auth/v1/token?grant_type=refresh_token",
      env.SUPABASE_ANON_KEY,
      { refresh_token: tokens.refresh_token },
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

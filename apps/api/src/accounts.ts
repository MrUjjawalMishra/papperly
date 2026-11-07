import { z } from "zod";
import { uuid } from "../../../packages/contracts/src/index";
import {
  canonicalPassword,
  provisionalCredential,
} from "../../../packages/domain/src/credentials";
import {
  rpc,
  supabase,
  ApiError,
  randomToken,
  hash,
  seal,
  type Tokens,
  type Env,
  type Session,
} from "./platform";
export const accountInput = z
  .object({
    schoolId: uuid.optional(),
    role: z.enum(["administrator", "teacher", "student"]),
    identityKey: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    loginId: z
      .string()
      .regex(/^[a-zA-Z0-9._-]{3,64}$/)
      .optional(),
    classId: uuid.optional(),
    className: z.string().max(50).optional(),
    section: z.string().max(50).optional(),
    roll: z.string().max(50).optional(),
    admissionNumber: z.string().max(100).optional(),
  })
  .strict();
export async function provision(env: Env, s: Session, input: unknown) {
  const p = accountInput.parse(input);
  if (
    p.role === "student" &&
    (!p.classId || !p.className || !p.section || !p.roll)
  )
    throw new ApiError(400, "ROSTER_REQUIRED");
  const credential =
    p.role === "student"
      ? provisionalCredential(p.name, p.className!, p.section!, p.roll!)
      : { loginId: p.loginId, password: randomToken() };
  if (!credential.loginId) throw new ApiError(400, "LOGIN_ID_REQUIRED");
  const reservation = await rpc<{ id: string; state: string; loginId: string }>(
    env,
    "reserve_account",
    { ...p, loginId: p.loginId ?? credential.loginId },
    s.accessToken,
  );
  if (reservation.state === "existing" || reservation.state === "active")
    return { id: reservation.id, state: reservation.state };
  if (reservation.state === "conflict")
    throw new ApiError(409, "ROSTER_CONFLICT");
  const job = await rpc<{
    id: string;
    state: string;
    details: z.infer<typeof accountInput>;
  } | null>(env, "runtime_provision_claim", { id: reservation.id });
  if (!job) throw new ApiError(409, "PROVISIONING_IN_PROGRESS");
  let issued = false;
  try {
    if (job.state !== "auth_created") {
      // Immutable UUID alias makes recovery independent of a changed login ID. Existing
      // Auth users are inspected by UUID and never reset as an import side effect.
      let exists = false;
      try {
        await supabase(
          env,
          `/auth/v1/admin/users/${job.id}`,
          env.SUPABASE_SERVICE_ROLE_KEY,
        );
        exists = true;
      } catch (e) {
        if (!(e instanceof ApiError) || e.status >= 500) throw e;
      }
      if (!exists) {
        await supabase(
          env,
          "/auth/v1/admin/users",
          env.SUPABASE_SERVICE_ROLE_KEY,
          {
            id: job.id,
            email: `${job.id}@${env.AUTH_ALIAS_DOMAIN}`,
            password: canonicalPassword(
              credential.password,
              p.role,
              p.role === "student"
                ? "name-roster-ascii-fold-v1"
                : "case-sensitive-v1",
            ),
            email_confirm: true,
            app_metadata: { papperly: true },
          },
        );
        issued = true;
      }
      await rpc(env, "runtime_provision_auth", { id: job.id });
    }
    await rpc(env, "runtime_provision_activate", { id: job.id });
    return {
      id: job.id,
      state: "active",
      loginId: reservation.loginId,
      ...(issued
        ? {
            issuedPassword: credential.password,
            passwordPolicy:
              p.role === "student"
                ? "ASCII case-insensitive"
                : "case-sensitive",
          }
        : {
            credentialRecovery:
              "Explicit authorized reset required; existing passwords cannot be retrieved",
          }),
    };
  } catch (e) {
    await rpc(env, "runtime_provision_failed", {
      id: job.id,
      code: "PROVISIONING_FAILED",
    });
    throw e;
  }
}
export async function reauthenticate(env: Env, s: Session, password: string) {
  const user = await rpc<{ id: string; role: string; policy: string }>(
    env,
    "runtime_credentials",
    { userId: s.userId },
  );
  try {
    await supabase(
      env,
      "/auth/v1/token?grant_type=password",
      env.SUPABASE_ANON_KEY,
      {
        email: `${s.userId}@${env.AUTH_ALIAS_DOMAIN}`,
        password: canonicalPassword(password, user.role, user.policy),
      },
    );
  } catch {
    throw new ApiError(401, "INVALID_CREDENTIALS");
  }
  await rpc(env, "runtime_reauthenticated", { hash: s.hash });
}
export async function credentialChange(env: Env, s: Session, input: unknown) {
  const p = z
    .object({
      userId: uuid,
      currentPassword: z.string().max(256),
      newPassword: z.string().max(256).optional(),
      reason: z.string().min(1).max(200),
    })
    .strict()
    .parse(input);
  await reauthenticate(env, s, p.currentPassword);
  const target = await rpc<{ id: string; role: string; policy: string }>(
    env,
    "prepare_credential_action",
    p,
    s.accessToken,
  );
  if (p.userId !== s.userId && p.newPassword)
    throw new ApiError(400, "RESET_PASSWORD_SERVER_GENERATED");
  const password = p.newPassword ?? randomToken();
  const canonical = canonicalPassword(password, target.role, target.policy);
  // Fail-safe sequence: revoke app sessions first. An Auth failure leaves them revoked;
  // retry/reset is explicit and does not pretend these calls form one transaction.
  await rpc(env, "runtime_credentials_revoke", {
    userId: target.id,
    actorId: s.userId,
    reason: p.reason,
  });
  await supabase(
    env,
    `/auth/v1/admin/users/${target.id}`,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { password: canonical },
    "PUT",
  );
  if (p.userId === s.userId) {
    const tokens = (await supabase(
      env,
      "/auth/v1/token?grant_type=password",
      env.SUPABASE_ANON_KEY,
      { email: `${s.userId}@${env.AUTH_ALIAS_DOMAIN}`, password: canonical },
    )) as Tokens;
    const user = await rpc<{ credentialVersion: number }>(
      env,
      "runtime_credentials",
      { userId: s.userId },
    );
    const opaque = randomToken(),
      csrfToken = randomToken();
    await rpc(env, "runtime_session_create", {
      hash: await hash(opaque),
      userId: s.userId,
      credentialVersion: user.credentialVersion,
      csrfHash: await hash(csrfToken),
      tokens: await seal(env, {
        ...tokens,
        csrf_token: csrfToken,
        expires_at: tokens.expires_at ?? Date.now() / 1000 + 3600,
      }),
    });
    return {
      id: target.id,
      sessionsRevoked: true,
      csrfToken,
      _cookie: `__Host-papperly=${opaque}; Secure; HttpOnly; SameSite=Strict; Path=/`,
    };
  }
  return {
    id: target.id,
    sessionsRevoked: true,
    issuedPassword: password,
    _cookie: undefined,
  };
}

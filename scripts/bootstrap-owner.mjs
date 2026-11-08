import process from "node:process";
import console from "node:console";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function adminClient(url, secret, fetcher = fetch) {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) || !secret?.trim())
    throw Error("Explicit Supabase project URL and server secret required");
  secret = secret.trim();
  return async (path, method = "GET", body, missingAllowed = false) => {
    if (!path.startsWith("/auth/v1/") && !path.startsWith("/rest/v1/"))
      throw Error("Unsupported admin path");
    let response;
    try {
      response = await fetcher(url + path, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          apikey: secret,
          ...(secret.startsWith("sb_secret_")
            ? {}
            : { Authorization: `Bearer ${secret}` }),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw Error("Restricted admin transport failed; no credentials logged");
    }
    const data = await response.json().catch(() => null);
    if (missingAllowed && response.status === 404) return null;
    if (!response.ok)
      throw Error(
        `Restricted admin operation ${method} ${path.split("?")[0]} failed (HTTP ${response.status})`,
      );
    return data;
  };
}

export async function bootstrapOwner(
  api,
  { userId, password, displayName, aliasDomain },
) {
  if (
    !/^[a-f0-9-]{36}$/.test(userId ?? "") ||
    !password ||
    password.length < 16 ||
    password.length > 256 ||
    !displayName?.trim() ||
    !/^[a-z0-9.-]+$/.test(aliasDomain ?? "")
  )
    throw Error(
      "Owner UUID, 16–256 character case-sensitive password, display name and alias domain required",
    );
  const owners = await api(
    "/rest/v1/memberships?role=eq.owner&active=eq.true&select=id&limit=1",
  );
  if (!Array.isArray(owners)) throw Error("Unexpected owner metadata");
  if (owners.length) {
    if (owners[0].id !== userId)
      throw Error(
        "An active owner already exists; restricted recovery must be explicit",
      );
    return { id: userId, state: "existing", credentialsIssued: false };
  }
  const email = `${userId}@${aliasDomain}`;
  const existing = await api(
    `/auth/v1/admin/users/${userId}`,
    "GET",
    undefined,
    true,
  );
  if (existing && (existing.id !== userId || existing.email !== email))
    throw Error("Bootstrap Auth identity mismatch");
  let createdAuth = false;
  if (!existing) {
    const user = await api("/auth/v1/admin/users", "POST", {
      id: userId,
      email,
      password,
      email_confirm: true,
      app_metadata: { papperly: true },
    });
    if (user?.id !== userId)
      throw Error("Bootstrap provider did not preserve immutable UUID");
    createdAuth = true;
  }
  try {
    await api("/rest/v1/memberships", "POST", {
      id: userId,
      school_id: null,
      role: "owner",
      display_name: displayName,
      active: true,
      must_change_password: true,
      credential_policy: "case-sensitive-v1",
    });
  } catch (error) {
    // Probe a lost response before compensating; Auth and PostgreSQL are not one transaction.
    let linked;
    try {
      linked = await api(
        `/rest/v1/memberships?id=eq.${userId}&role=eq.owner&select=id`,
      );
    } catch {
      throw Error(
        "Bootstrap link outcome unknown; reconcile by UUID before retrying",
      );
    }
    if (!Array.isArray(linked) || !linked.some((m) => m.id === userId)) {
      if (createdAuth) await api(`/auth/v1/admin/users/${userId}`, "DELETE");
      throw error;
    }
  }
  await api("/rest/v1/audit_events", "POST", {
    id: randomUUID(),
    school_id: null,
    actor_id: userId,
    actor_role: "owner",
    subject_id: userId,
    action: "owner.bootstrapped",
    reason: "Restricted initial setup; no credential material recorded",
  });
  return { id: userId, state: "active", credentialsIssued: createdAuth };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await bootstrapOwner(
      adminClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      {
        userId: process.env.OWNER_BOOTSTRAP_USER_ID,
        password: process.env.OWNER_BOOTSTRAP_PASSWORD,
        displayName: process.env.OWNER_DISPLAY_NAME,
        aliasDomain: process.env.AUTH_ALIAS_DOMAIN,
      },
    );
    // Password is supplied through a secure mechanism, never printed or retained here.
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Owner bootstrap failed",
    );
    process.exitCode = 1;
  }
}

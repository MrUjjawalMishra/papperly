import process from "node:process";
import console from "node:console";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adminClient, bootstrapOwner } from "./bootstrap-owner.mjs";

export function stagingOwnerInput(target, env) {
  if (
    env.GITHUB_REPOSITORY !== "MrUjjawalMishra/papperly" ||
    target.repository !== env.GITHUB_REPOSITORY ||
    env.GITHUB_REF !== "refs/heads/ops/staging-owner-bootstrap" ||
    target.supabaseUrl !== "https://soudjtewvquywncqtwyo.supabase.co" ||
    target.worker !== "papperly-api-staging" ||
    target.workersSubdomain !== "mr-ujjawalmishra" ||
    target.authAliasDomain !== "identities.staging.papperly.invalid"
  )
    throw Error(
      "Restricted owner activation requires the verified staging target and branch",
    );
  if (!env.OWNER_BOOTSTRAP_PASSWORD || env.OWNER_BOOTSTRAP_PASSWORD.length < 16)
    throw Error(
      "Save OWNER_BOOTSTRAP_PASSWORD in the Cloudflare GitHub environment; never send its value in chat",
    );
  return {
    userId: "3807692f-7a42-4231-ab1b-05a64fd20621",
    password: env.OWNER_BOOTSTRAP_PASSWORD,
    displayName: "Papperly Platform Owner",
    aliasDomain: target.authAliasDomain,
  };
}

export async function verifyOwnerLogin(target, input, fetcher = fetch) {
  const base = `https://${target.worker}.${target.workersSubdomain}.workers.dev`;
  const login = await fetcher(base + "/v1/auth/owner-login", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      schoolCode: "platform",
      loginId: "owner",
      password: input.password,
    }),
  });
  const data = await login.json().catch(() => null);
  const cookie = login.headers.get("set-cookie");
  if (
    !login.ok ||
    data?.user?.id !== input.userId ||
    data?.user?.role !== "owner" ||
    !data.csrfToken ||
    !cookie?.includes("HttpOnly") ||
    !cookie.includes("Secure")
  )
    throw Error(
      "Owner activated but protected login verification failed; do not reset or recreate the account",
    );
  const headers = {
    Cookie: cookie.split(";")[0],
    Origin: base,
    "X-CSRF-Token": data.csrfToken,
  };
  const session = await fetcher(base + "/v1/auth/session", {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  const state = await session.json().catch(() => null);
  const logout = await fetcher(base + "/v1/auth/logout", {
    method: "POST",
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!session.ok || state?.user?.id !== input.userId || !logout.ok)
    throw Error(
      "Owner session verification or diagnostic-session logout failed",
    );
  return {
    loginVerified: true,
    mustChangePassword: state.mustChangePassword === true,
    diagnosticSessionLoggedOut: true,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const target = JSON.parse(
      readFileSync("docs/staging-release-target.json", "utf8"),
    );
    const input = stagingOwnerInput(target, process.env);
    const result = await bootstrapOwner(
      adminClient(target.supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY),
      input,
    );
    const verification = await verifyOwnerLogin(target, input).catch(() => {
      throw Error(
        "Owner activation completed; live login verification failed. Reconcile the existing owner without resetting or logging credentials",
      );
    });
    console.log(
      JSON.stringify({
        ...result,
        ...verification,
        environment: "staging",
        commit: process.env.GITHUB_SHA,
      }),
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Restricted owner activation failed",
    );
    process.exitCode = 1;
  }
}

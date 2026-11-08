import { expect, it } from "vitest";
import {
  stagingOwnerInput,
  verifyOwnerLogin,
} from "../scripts/staging-owner-bootstrap.mjs";
const target = {
  repository: "MrUjjawalMishra/papperly",
  supabaseUrl: "https://soudjtewvquywncqtwyo.supabase.co",
  authAliasDomain: "identities.staging.papperly.invalid",
  worker: "papperly-api-staging",
  workersSubdomain: "mr-ujjawalmishra",
};
const env = {
  GITHUB_REPOSITORY: target.repository,
  GITHUB_REF: "refs/heads/ops/staging-owner-bootstrap",
  OWNER_BOOTSTRAP_PASSWORD: crypto.randomUUID(),
};
it("restricts owner activation to the verified staging repository, branch and project", () => {
  expect(stagingOwnerInput(target, env).userId).toBe(
    "3807692f-7a42-4231-ab1b-05a64fd20621",
  );
  for (const bad of [
    { GITHUB_REPOSITORY: "other/repository" },
    { GITHUB_REF: "refs/heads/main" },
  ])
    expect(() => stagingOwnerInput(target, { ...env, ...bad })).toThrow(
      "verified staging",
    );
  expect(() =>
    stagingOwnerInput(
      { ...target, supabaseUrl: "https://other.supabase.co" },
      env,
    ),
  ).toThrow("verified staging");
});
it("checks the actual owner session, logs out diagnostics and returns no credentials", async () => {
  const input = stagingOwnerInput(target, env),
    calls = [];
  const result = await verifyOwnerLogin(target, input, async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith("owner-login"))
      return Response.json(
        {
          user: { id: input.userId, role: "owner" },
          csrfToken: "synthetic-csrf",
        },
        {
          headers: {
            "set-cookie":
              "__Host-papperly=synthetic-session; Secure; HttpOnly; SameSite=Strict; Path=/",
          },
        },
      );
    if (url.endsWith("session"))
      return Response.json({
        user: { id: input.userId, role: "owner" },
        mustChangePassword: true,
      });
    return Response.json({ ok: true });
  });
  expect(result).toEqual({
    loginVerified: true,
    mustChangePassword: true,
    diagnosticSessionLoggedOut: true,
  });
  expect(calls[2][1].headers["X-CSRF-Token"]).toBe("synthetic-csrf");
  expect(calls[2][1].method).toBe("POST");
  expect(JSON.stringify(result)).not.toContain(input.password);
  expect(JSON.stringify(result)).not.toContain("synthetic-session");
});
it("refuses a successful login for the wrong identity", async () => {
  await expect(
    verifyOwnerLogin(target, stagingOwnerInput(target, env), async () =>
      Response.json({ user: { id: "different", role: "owner" } }),
    ),
  ).rejects.toThrow("protected login verification failed");
});
it("fails closed before any provider call when the secure owner password is missing", () => {
  expect(() =>
    stagingOwnerInput(target, { ...env, OWNER_BOOTSTRAP_PASSWORD: "" }),
  ).toThrow("Save OWNER_BOOTSTRAP_PASSWORD");
});

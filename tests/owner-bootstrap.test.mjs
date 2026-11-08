import { expect, it } from "vitest";
import { bootstrapOwner } from "../scripts/bootstrap-owner.mjs";
const input = {
  userId: "a0000000-0000-4000-8000-000000000001",
  password: crypto.randomUUID(),
  displayName: "Synthetic owner",
  aliasDomain: "staging.invalid",
};
it("never resets an existing owner or discloses its password on retry", async () => {
  const paths = [];
  const result = await bootstrapOwner(async (path) => {
    paths.push(path);
    return [{ id: input.userId }];
  }, input);
  expect(result).toEqual({
    id: input.userId,
    state: "existing",
    credentialsIssued: false,
  });
  expect(paths).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain(input.password);
});
it("compensates only its newly created Auth identity when the database link definitely failed", async () => {
  const paths = [];
  await expect(
    bootstrapOwner(async (path, method = "GET") => {
      paths.push([path, method]);
      if (path.includes("memberships?") && method === "GET") return [];
      if (path === `/auth/v1/admin/users/${input.userId}`) return null;
      if (path === "/auth/v1/admin/users") return { id: input.userId };
      if (path === "/rest/v1/memberships")
        throw Error("synthetic database conflict");
      throw Error("unexpected");
    }, input),
  ).rejects.toThrow("database conflict");
  expect(paths).toContainEqual([
    `/auth/v1/admin/users/${input.userId}`,
    "DELETE",
  ]);
});
it("recovers a lost membership response without deleting the linked identity", async () => {
  const deleted = [];
  const result = await bootstrapOwner(async (path, method = "GET") => {
    if (method === "DELETE") deleted.push(path);
    if (path.includes("active=eq.true")) return [];
    if (path.includes("memberships?id=")) return [{ id: input.userId }];
    if (path === `/auth/v1/admin/users/${input.userId}`) return null;
    if (path === "/auth/v1/admin/users") return { id: input.userId };
    if (path === "/rest/v1/memberships") throw Error("lost response");
    if (path === "/rest/v1/audit_events") return [];
    throw Error("unexpected");
  }, input);
  expect(result.id).toBe(input.userId);
  expect(deleted).toHaveLength(0);
});

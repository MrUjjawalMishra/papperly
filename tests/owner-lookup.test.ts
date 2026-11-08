import { beforeAll, afterAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { database, ids, asUser } from "./database";
let db: PGlite;
beforeAll(async () => {
  db = await database();
}, 60000);
afterAll(async () => {
  await db?.close();
});
it("resolves only the active singleton owner for the server role; ordinary users cannot call the lookup", async () => {
  await db.exec("set role service_role");
  try {
    const r = await db.query<{ data: { id: string } }>(
      "select runtime_owner_lookup('{}') as data",
    );
    expect(r.rows[0].data.id).toBe(ids.owner);
    const wrong = await db.query<{ data: unknown }>(
      "select runtime_owner_lookup($1::jsonb) as data",
      [JSON.stringify({ userId: ids.student })],
    );
    expect(wrong.rows[0].data).toBeNull();
  } finally {
    await db.exec("reset role");
  }
  await expect(
    asUser(db, ids.student, "select runtime_owner_lookup('{}')"),
  ).rejects.toThrow();
  await db.exec("update memberships set active=false where role='owner'");
  const disabled = await db.query<{ data: unknown }>(
    "select runtime_owner_lookup('{}') as data",
  );
  expect(disabled.rows[0].data).toBeNull();
  await db.query(
    "insert into memberships(id,role,display_name)values($1,'owner','New synthetic owner')",
    ["a0000000-0000-4000-8000-000000000009"],
  );
  await expect(
    db.query(
      "insert into memberships(id,role,display_name)values($1,'owner','Second active owner')",
      ["a0000000-0000-4000-8000-000000000010"],
    ),
  ).rejects.toThrow();
});

import { beforeEach, afterEach, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { database, ids, asUser, call, claims } from "./database";
let db: PGlite;
beforeEach(async () => {
  db = await database();
}, 60000);
afterEach(async () => {
  await db?.close();
});
it("denies inactive and unprovisioned identities at definer RPC and table boundaries", async () => {
  await db.query("update memberships set active=false where id=$1", [
    ids.student,
  ]);
  await expect(call(db, ids.student, "owner_usage", {})).rejects.toThrow(
    "FORBIDDEN",
  );
  await expect(
    asUser(db, ids.student, "select * from memberships where id=$1", [
      ids.student,
    ]),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    call(db, "a0000000-0000-4000-8000-000000000091", "owner_usage", {}),
  ).rejects.toThrow("FORBIDDEN");
  const usage = await call<unknown[]>(db, ids.owner, "owner_usage", {});
  expect(usage).toHaveLength(2);
});
it("invalidates old provider JWT sessions after reset while admitting a fresh authenticated session", async () => {
  expect(
    (
      await asUser(db, ids.student, "select id from memberships where id=$1", [
        ids.student,
      ])
    ).rows,
  ).toHaveLength(1);
  await db.query("select runtime_credentials_revoke($1::jsonb)", [
    JSON.stringify({
      userId: ids.student,
      actorId: ids.teacher,
      reason: "Synthetic reset",
    }),
  ]);
  await expect(
    asUser(db, ids.student, "select id from memberships where id=$1", [
      ids.student,
    ]),
  ).rejects.toThrow("SESSION_REVOKED");
  const fresh = "a0000000-0000-4000-8000-000000000092";
  await db.query(
    "insert into auth.sessions(id,user_id,created_at)values($1,$2,clock_timestamp())",
    [fresh, ids.student],
  );
  expect(
    (
      await asUser(
        db,
        ids.student,
        "select id from memberships where id=$1",
        [ids.student],
        fresh,
      )
    ).rows,
  ).toHaveLength(1);
  await call(db, ids.teacher, "force_logout", {
    userId: ids.student,
    reason: "Synthetic forced logout",
  });
  await expect(
    asUser(
      db,
      ids.student,
      "select id from memberships where id=$1",
      [ids.student],
      fresh,
    ),
  ).rejects.toThrow("SESSION_REVOKED");
});
it("rejects expired or deleted Auth sessions and keeps explicit anonymous public reads working", async () => {
  await db.query(
    "update auth.sessions set not_after=now()-interval '1 second'where id=$1",
    [ids.student],
  );
  await expect(
    asUser(db, ids.student, "select id from memberships where id=$1", [
      ids.student,
    ]),
  ).rejects.toThrow("SESSION_REVOKED");
  await db.query("delete from auth.sessions where id=$1", [ids.student]);
  await expect(
    asUser(db, ids.student, "select id from memberships where id=$1", [
      ids.student,
    ]),
  ).rejects.toThrow("SESSION_REVOKED");
  await db.exec(
    "set role anon;select set_config('request.jwt.claim.sub','',false);select set_config('request.jwt.claims','{\"role\":\"anon\"}',false)",
  );
  try {
    expect(
      (await db.query<{ data: unknown[] }>("select directory('{}')as data"))
        .rows[0].data,
    ).toEqual([]);
  } finally {
    await db.exec("reset role");
    await claims(db);
  }
});
it("applies the identity guard restrictively to every public application table", async () => {
  const result = await db.query<{ missing: number }>(
    "select count(*)::int as missing from pg_tables t where t.schemaname='public'and not exists(select 1 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=t.schemaname and c.relname=t.tablename and p.polname='identity_current'and not p.polpermissive)",
  );
  expect(result.rows[0].missing).toBe(0);
});

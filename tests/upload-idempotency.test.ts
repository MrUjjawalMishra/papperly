import { beforeEach, afterEach, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { database, ids, call, asUser } from "./database";
let db: PGlite;
beforeEach(async () => {
  db = await database();
}, 60000);
afterEach(async () => {
  await db?.close();
});
async function request() {
  const groupId = await call<string>(db, ids.teacher, "create_group", {
    classId: ids.class,
    subject: "Computing",
    title: "Synthetic files",
  });
  const postId = await call<string>(db, ids.teacher, "write_post", {
    groupId,
    title: "Document",
    body: "Synthetic material",
  });
  return {
    postId,
    filename: "practice.pdf",
    type: "application/pdf",
    size: 100,
    checksum: "synthetic-checksum",
  };
}
it("charges once and returns the same reservation for explicit and content-derived retries", async () => {
  const p = await request();
  const first = await call<{ id: string; requiresUpload: boolean }>(
    db,
    ids.teacher,
    "reserve_upload",
    p,
  );
  const retry = await call<{ id: string }>(
    db,
    ids.teacher,
    "reserve_upload",
    p,
  );
  expect(retry.id).toBe(first.id);
  expect(first.requiresUpload).toBe(true);
  const explicit = { ...p, idempotencyKey: "synthetic-request-0001" };
  const second = await call<{ id: string }>(
    db,
    ids.teacher,
    "reserve_upload",
    explicit,
  );
  expect(
    (await call<{ id: string }>(db, ids.teacher, "reserve_upload", explicit))
      .id,
  ).toBe(second.id);
  expect(
    (
      await db.query<{ used: number }>(
        "select sum(size)::int as used from attachments where charged",
      )
    ).rows[0].used,
  ).toBe(200);
  expect(
    (await db.query("select * from audit_events where action='file.reserved'"))
      .rows,
  ).toHaveLength(2);
});
it("rejects mismatched, retired or unauthorized replays before changing quota or bytes", async () => {
  const p = { ...(await request()), idempotencyKey: "synthetic-request-0002" };
  const first = await call<{ id: string }>(
    db,
    ids.teacher,
    "reserve_upload",
    p,
  );
  await expect(
    call(db, ids.teacher, "reserve_upload", { ...p, checksum: "different" }),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  await expect(call(db, ids.other, "reserve_upload", p)).rejects.toThrow(
    "FORBIDDEN",
  );
  await db.query(
    "update attachments set state='deleted',charged=false where id=$1",
    [first.id],
  );
  await expect(call(db, ids.teacher, "reserve_upload", p)).rejects.toThrow(
    "UPLOAD_RETIRED",
  );
  await expect(
    asUser(db, ids.teacher, "select * from private.upload_requests"),
  ).rejects.toThrow("permission denied");
});
it("does not rewrite a completed or clean object on retry and deduplicates scan work", async () => {
  const p = await request();
  const first = await call<{ id: string }>(
    db,
    ids.teacher,
    "reserve_upload",
    p,
  );
  await call(db, ids.teacher, "complete_upload", { id: first.id });
  await call(db, ids.teacher, "complete_upload", { id: first.id });
  expect(
    (
      await call<{ requiresUpload: boolean }>(
        db,
        ids.teacher,
        "reserve_upload",
        p,
      )
    ).requiresUpload,
  ).toBe(false);
  await db.query("update attachments set state='clean'where id=$1", [first.id]);
  expect(await call(db, ids.teacher, "reserve_upload", p)).toMatchObject({
    id: first.id,
    state: "clean",
    requiresUpload: false,
  });
  expect(
    (await db.query("select * from outbox where kind='scan'")).rows,
  ).toHaveLength(1);
});

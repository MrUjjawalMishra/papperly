import { beforeEach, afterEach, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { database, ids, call } from "./database";
let db: PGlite;
beforeEach(async () => {
  db = await database();
}, 60000);
afterEach(async () => {
  await db?.close();
});
async function fixture() {
  const profileId = await call<string>(db, ids.admin, "manage_profile", {
    action: "create",
    teacherId: ids.teacher,
    displayName: "Synthetic teacher",
    reason: "Fixture",
  });
  const profileRevision = await call<string>(
    db,
    ids.teacher,
    "manage_profile",
    {
      action: "draft",
      profileId,
      content: { biography: "Approved" },
      reason: "Fixture",
    },
  );
  await call(db, ids.admin, "manage_profile", {
    action: "approve",
    profileId,
    revisionId: profileRevision,
    audience: "school",
    reason: "Fixture",
  });
  const revisionId = await call<string>(db, ids.teacher, "write_article", {
    profileId,
    title: "Synthetic",
    summary: "Summary",
    body: "Lesson",
    subject: "Computing",
    state: "submitted",
  });
  const articleId = (
    await db.query<{ article_id: string }>(
      "select article_id from article_revisions where id=$1",
      [revisionId],
    )
  ).rows[0].article_id;
  return { profileId, profileRevision, revisionId, articleId };
}
const upload = (parent: Record<string, string>, type = "application/pdf") =>
  call<{ id: string }>(db, ids.teacher, "reserve_upload", {
    ...parent,
    filename: type === "image/png" ? "photo.png" : "lesson.pdf",
    type,
    size: 100,
    checksum: "a".repeat(64),
  });
async function publish(
  f: { articleId: string; revisionId: string },
  fileId: string,
) {
  await call(db, ids.admin, "moderate_article", {
    ...f,
    action: "publish",
    audience: "school",
    reason: "Separately approve attachment",
    assetIds: [fileId],
  });
  return (
    await db.query<{ id: string }>(
      "select id from public_assets where revoked_at is null order by id limit 1",
    )
  ).rows[0];
}
async function claim(kind: string) {
  return (
    await db.query<{ data: { id: string; runToken: string } }>(
      "select runtime_claim(jsonb_build_object('id',id))as data from outbox where kind=$1 and status='pending'limit 1",
      [kind],
    )
  ).rows[0].data;
}
it("refuses unscanned uploads and private group attachments as publication assets", async () => {
  const f = await fixture(),
    file = await upload({ articleRevisionId: f.revisionId });
  expect(await call(db, ids.teacher, "file_status", file)).toMatchObject({
    state: "quarantined",
    filename: "lesson.pdf",
  });
  await expect(call(db, ids.other, "file_status", file)).rejects.toThrow(
    "FILE_UNAVAILABLE",
  );
  await expect(publish(f, file.id)).rejects.toThrow(
    "ASSET_NOT_CLEAN_OR_INDEPENDENT",
  );
  const groupId = await call<string>(db, ids.teacher, "create_group", {
    classId: ids.class,
    subject: "Computing",
    title: "Private",
  });
  const postId = await call<string>(db, ids.teacher, "write_post", {
    groupId,
    title: "Private",
    body: "Members only",
  });
  const privateFile = await upload({ postId });
  await db.query("update attachments set state='clean'where id=$1", [
    privateFile.id,
  ]);
  await expect(publish(f, privateFile.id)).rejects.toThrow(
    "ASSET_NOT_CLEAN_OR_INDEPENDENT",
  );
  expect((await db.query("select * from public_assets")).rows).toHaveLength(0);
});
it("reserves copy quota once and permits only ready copies under current audience authorization", async () => {
  const f = await fixture(),
    file = await upload({ articleRevisionId: f.revisionId });
  await db.query("update attachments set state='clean'where id=$1", [file.id]);
  const asset = await publish(f, file.id);
  await expect(
    call(db, ids.student, "publication_asset", asset),
  ).rejects.toThrow("ASSET_UNAVAILABLE");
  const job = await claim("asset_copy");
  expect(
    (
      await db.query<{ data: unknown }>(
        "select runtime_asset_plan($1::jsonb)as data",
        [JSON.stringify({ jobId: job.id, runToken: job.runToken })],
      )
    ).rows[0].data,
  ).toMatchObject({ checksum: "a".repeat(64), size: 100 });
  expect(
    (
      await db.query<{ data: boolean }>(
        "select runtime_asset_finish($1::jsonb)as data",
        [JSON.stringify({ jobId: job.id, runToken: job.runToken })],
      )
    ).rows[0].data,
  ).toBe(true);
  expect(await call(db, ids.student, "publication_asset", asset)).toMatchObject(
    { filename: "lesson.pdf" },
  );
  await expect(call(db, ids.other, "publication_asset", asset)).rejects.toThrow(
    "ASSET_UNAVAILABLE",
  );
  expect(
    (
      await call<{ assets: unknown[] }>(db, ids.student, "article_detail", {
        articleId: f.articleId,
      })
    ).assets,
  ).toHaveLength(1);
  await publish(f, file.id);
  expect((await db.query("select * from public_assets")).rows).toHaveLength(1);
});
it("rejects stale copy completion after unpublish and retains charges until deletion is acknowledged", async () => {
  const f = await fixture(),
    file = await upload({ articleRevisionId: f.revisionId });
  await db.query("update attachments set state='clean'where id=$1", [file.id]);
  const asset = await publish(f, file.id),
    copying = await claim("asset_copy");
  await call(db, ids.teacher, "moderate_article", {
    articleId: f.articleId,
    action: "unpublish",
    reason: "Withdraw",
  });
  expect(
    (
      await db.query<{ data: boolean }>(
        "select runtime_asset_finish($1::jsonb)as data",
        [JSON.stringify({ jobId: copying.id, runToken: copying.runToken })],
      )
    ).rows[0].data,
  ).toBe(false);
  expect(
    (
      await db.query<{ charged: boolean }>(
        "select charged from public_assets where id=$1",
        [asset.id],
      )
    ).rows[0].charged,
  ).toBe(true);
  const cleanup = await claim("asset_cleanup");
  await db.query("select runtime_asset_finish($1::jsonb)", [
    JSON.stringify({ jobId: cleanup.id, runToken: cleanup.runToken }),
  ]);
  expect(
    (
      await db.query<{ charged: boolean }>(
        "select charged from public_assets where id=$1",
        [asset.id],
      )
    ).rows[0].charged,
  ).toBe(false);
  await expect(
    call(db, ids.student, "publication_asset", asset),
  ).rejects.toThrow("ASSET_UNAVAILABLE");
  const candidates = (
    await db.query<{ data: { id: string }[] }>(
      "select runtime_asset_cleanup_candidates('{}')as data",
    )
  ).rows[0].data;
  expect(candidates.map((a) => a.id)).toContain(asset.id);
});
it("keeps profile photos as separately approved clean image copies and school contact facts administrator-controlled", async () => {
  const f = await fixture();
  await expect(upload({ profileId: f.profileId })).rejects.toThrow("FORBIDDEN");
  const file = await upload({ profileId: f.profileId }, "image/png");
  await db.query("update attachments set state='clean'where id=$1", [file.id]);
  const revision = await call<string>(db, ids.teacher, "manage_profile", {
    action: "draft",
    profileId: f.profileId,
    content: { biography: "Reviewed photo" },
    reason: "Photo request",
  });
  await call(db, ids.admin, "manage_profile", {
    action: "approve",
    profileId: f.profileId,
    revisionId: revision,
    audience: "school",
    reason: "Photo approved",
    photoAttachmentId: file.id,
  });
  const job = await claim("asset_copy");
  await db.query("select runtime_asset_finish($1::jsonb)", [
    JSON.stringify({ jobId: job.id, runToken: job.runToken }),
  ]);
  expect(
    await call(db, ids.student, "profile_detail", { profileId: f.profileId }),
  ).toMatchObject({
    photo: { filename: "photo.png", type: "image/png" },
    contact: {},
  });
  const pr = (
    await db.query<{ revision: number }>(
      "select revision from teacher_profiles where id=$1",
      [f.profileId],
    )
  ).rows[0];
  const edit = {
    profileId: f.profileId,
    revision: pr.revision,
    displayName: "Synthetic teacher",
    designation: "Teacher",
    qualifications: "Verified",
    experience: "Verified",
    contact: { kind: "office", value: "School reception" },
    reason: "Approved school contact",
  };
  await expect(
    call(db, ids.teacher, "update_profile_details", edit),
  ).rejects.toThrow("FORBIDDEN");
  await call(db, ids.admin, "update_profile_details", edit);
  expect(
    await call(db, ids.student, "profile_detail", { profileId: f.profileId }),
  ).toMatchObject({ contact: { kind: "office", value: "School reception" } });
});

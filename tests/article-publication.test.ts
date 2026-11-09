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
async function draft() {
  const profileId = await call<string>(db, ids.admin, "manage_profile", {
    action: "create",
    teacherId: ids.teacher,
    displayName: "Synthetic teacher",
    subjects: [],
    classes: [],
    reason: "Fixture",
  });
  const profileRevision = await call<string>(
    db,
    ids.teacher,
    "manage_profile",
    {
      action: "draft",
      profileId,
      content: { biography: "Approved biography" },
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
  const input = {
    profileId,
    title: "Synthetic lesson",
    summary: "Approved summary",
    subject: "Computing",
    body: "**Study** the concept",
    state: "submitted",
  };
  const revisionId = await call<string>(
    db,
    ids.teacher,
    "write_article",
    input,
  );
  const articleId = (
    await db.query<{ article_id: string }>(
      "select article_id from article_revisions where id=$1",
      [revisionId],
    )
  ).rows[0].article_id;
  return { profileId, input, revisionId, articleId };
}
const anonymous = async (name: string, p: unknown) => {
  await db.exec("set role anon");
  await db.query(
    "select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','{}',false)",
  );
  try {
    return (
      await db.query<{ data: Record<string, unknown> }>(
        `select public.${name}($1::jsonb)as data`,
        [JSON.stringify(p)],
      )
    ).rows[0].data;
  } finally {
    await db.exec("reset role");
  }
};
it("keeps drafts private and the previous approved revision visible while edits await review", async () => {
  const f = await draft();
  await expect(
    call(db, ids.student, "article_detail", { articleId: f.articleId }),
  ).rejects.toThrow("ARTICLE_UNAVAILABLE");
  await call(db, ids.admin, "moderate_article", {
    ...f,
    action: "publish",
    audience: "school",
    reason: "Approved",
  });
  expect(
    await call(db, ids.student, "article_detail", { articleId: f.articleId }),
  ).toMatchObject({ title: "Synthetic lesson", body: "**Study** the concept" });
  await call(db, ids.teacher, "write_article", {
    ...f.input,
    articleId: f.articleId,
    revision: 2,
    body: "Private draft",
  });
  expect(
    await call(db, ids.student, "article_detail", { articleId: f.articleId }),
  ).toMatchObject({ body: "**Study** the concept" });
  await expect(
    call(db, ids.teacher, "write_article", {
      ...f.input,
      articleId: f.articleId,
    }),
  ).rejects.toThrow("STALE_REVISION");
  await expect(
    call(db, ids.other, "article_detail", { articleId: f.articleId }),
  ).rejects.toThrow("ARTICLE_UNAVAILABLE");
  await expect(
    anonymous("article_detail", { articleId: f.articleId }),
  ).rejects.toThrow("ARTICLE_UNAVAILABLE");
});
it("requires explicit public school policy, serves approved direct reads and retires prior audiences/assets", async () => {
  const f = await draft(),
    p = { ...f, action: "publish", audience: "public", reason: "Approval" };
  await expect(call(db, ids.admin, "moderate_article", p)).rejects.toThrow(
    "PUBLIC_NOT_ENABLED",
  );
  await call(db, ids.admin, "set_public_policy", {
    enabled: true,
    indexingEnabled: false,
    reason: "Approval",
  });
  await call(db, ids.admin, "moderate_article", p);
  expect(
    await anonymous("article_detail", { articleId: f.articleId }),
  ).toMatchObject({ title: "Synthetic lesson", indexingEnabled: false });
  const publication = (
    await db.query<{ id: string }>(
      "select id from content_publications where article_id=$1 and revoked_at is null",
      [f.articleId],
    )
  ).rows[0];
  await db.query(
    "insert into public_assets(school_id,publication_id,object_key,approved)values($1,$2,'synthetic/no-object',true)",
    [ids.school, publication.id],
  );
  await call(db, ids.admin, "moderate_article", { ...p, audience: "school" });
  expect(
    (
      await db.query(
        "select * from content_publications where article_id=$1 and revoked_at is null",
        [f.articleId],
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query<{ revoked_at: string }>(
        "select revoked_at from public_assets",
      )
    ).rows[0].revoked_at,
  ).toBeTruthy();
  await expect(
    anonymous("article_detail", { articleId: f.articleId }),
  ).rejects.toThrow("ARTICLE_UNAVAILABLE");
});
it("defaults to review and scopes audited trusted publishing to its granted audience and expiry", async () => {
  const f = await draft(),
    p = {
      ...f,
      action: "publish",
      audience: "school",
      reason: "Delegated publication",
    };
  await expect(call(db, ids.teacher, "moderate_article", p)).rejects.toThrow(
    "FORBIDDEN",
  );
  await call(db, ids.admin, "manage_publisher", {
    teacherId: ids.teacher,
    action: "grant",
    audience: "school",
    reason: "Designated publisher",
  });
  await call(db, ids.teacher, "moderate_article", p);
  await expect(
    call(db, ids.teacher, "moderate_article", { ...p, audience: "public" }),
  ).rejects.toThrow("FORBIDDEN");
  await call(db, ids.admin, "manage_publisher", {
    teacherId: ids.teacher,
    action: "revoke",
    audience: "school",
    reason: "Revoke permission",
  });
  await expect(call(db, ids.teacher, "moderate_article", p)).rejects.toThrow(
    "FORBIDDEN",
  );
  expect(
    (
      await db.query(
        "select * from audit_events where action='article.publisher.grant'",
      )
    ).rows,
  ).toHaveLength(1);
});
it("requires a school decision on teacher deactivation and retains only approved archived-author content", async () => {
  const f = await draft();
  await call(db, ids.admin, "moderate_article", {
    ...f,
    action: "publish",
    audience: "school",
    reason: "Approval",
  });
  await expect(
    call(db, ids.admin, "deactivate_user", {
      userId: ids.teacher,
      reason: "Leaving",
    }),
  ).rejects.toThrow("ARTICLE_POLICY_REQUIRED");
  await call(db, ids.admin, "deactivate_user", {
    userId: ids.teacher,
    reason: "Leaving",
    articlePolicy: "retain",
  });
  expect(
    await call(db, ids.student, "article_detail", { articleId: f.articleId }),
  ).toMatchObject({
    author: {
      displayName: "Synthetic teacher",
      archived: true,
      profileId: null,
    },
  });
  await expect(
    call(db, ids.student, "profile_detail", { profileId: f.profileId }),
  ).rejects.toThrow("PROFILE_UNAVAILABLE");
  await expect(call(db, ids.teacher, "write_article", f.input)).rejects.toThrow(
    "FORBIDDEN",
  );
});
it("preserves teacher authorship while attributing administrator edits and permits immediate author unpublish", async () => {
  const f = await draft();
  await call(db, ids.admin, "moderate_article", {
    ...f,
    action: "publish",
    audience: "school",
    reason: "Approval",
  });
  const revision = await call<string>(db, ids.admin, "write_article", {
    ...f.input,
    articleId: f.articleId,
    revision: 2,
    body: "School edit",
    reason: "Factual correction",
  });
  expect(
    (
      await db.query("select editor_id from article_revisions where id=$1", [
        revision,
      ])
    ).rows[0],
  ).toMatchObject({ editor_id: ids.admin });
  expect(
    (
      await db.query("select author_id from teacher_articles where id=$1", [
        f.articleId,
      ])
    ).rows[0],
  ).toMatchObject({ author_id: ids.teacher });
  await call(db, ids.teacher, "moderate_article", {
    articleId: f.articleId,
    action: "unpublish",
    reason: "Immediate withdrawal",
  });
  expect(
    await call(db, ids.student, "profile_articles", { profileId: f.profileId }),
  ).toEqual([]);
});

import { beforeAll, afterAll, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { database, call, asUser, ids } from "./database";
import { fixturePaper, uid } from "./fixtures";
import { parseRoster, rosterTemplate } from "../packages/domain/src/imports";
import {
  canonicalPassword,
  provisionalCredential,
} from "../packages/domain/src/credentials";
import { validateFile } from "../packages/domain/src/files";
let db: PGlite;
beforeAll(async () => {
  db = await database();
}, 60000);
afterAll(async () => {
  await db?.close();
});
it("isolates approved student case handling and never changes staff passwords", () => {
  const c = provisionalCredential("Ujjawal Mishra", "9", "B", "15");
  expect(c.loginId).toBe("Ujjawal.9B15");
  expect(c.password).toBe("Ujjawal9B15");
  expect(canonicalPassword("Ujjawal9B15", "student", c.policy)).toBe(
    canonicalPassword("uJJAWAL9b15", "student", c.policy),
  );
  expect(canonicalPassword("StaffSecret123", "teacher", c.policy)).toBe(
    "StaffSecret123",
  );
});
it("validates a real XLSX template and rejects unsupported binary files", () => {
  expect(parseRoster(rosterTemplate())).toEqual([]);
  expect(() => parseRoster(new Uint8Array([1, 2]))).toThrow();
  expect(() =>
    validateFile("x.html", "text/html", new TextEncoder().encode("<html>")),
  ).toThrow();
  expect(() =>
    validateFile(
      "x.pdf",
      "application/pdf",
      new TextEncoder().encode("malicious"),
    ),
  ).toThrow();
});
it("reserves quota once, activates recoverably and reuses existing registry identity", async () => {
  const p = {
    role: "student",
    identityKey: "roster-03",
    name: "Fictional New",
    loginId: "Fictional.9B03",
    classId: ids.class,
    roll: "03",
  };
  const r = await call<{ id: string; state: string }>(
    db,
    ids.teacher,
    "reserve_account",
    p,
  );
  expect(
    (await call<{ id: string }>(db, ids.teacher, "reserve_account", p)).id,
  ).toBe(r.id);
  await db.query("select runtime_provision_auth($1::jsonb)", [
    JSON.stringify({ id: r.id }),
  ]);
  await db.query("select runtime_provision_activate($1::jsonb)", [
    JSON.stringify({ id: r.id }),
  ]);
  await db.query("select runtime_provision_activate($1::jsonb)", [
    JSON.stringify({ id: r.id }),
  ]);
  expect(
    await call<{ state: string; id: string }>(
      db,
      ids.teacher,
      "reserve_account",
      { ...p, identityKey: "another-import" },
    ),
  ).toMatchObject({ state: "existing", id: r.id });
  expect(
    (
      await call<{ state: string }>(db, ids.teacher, "reserve_account", {
        ...p,
        identityKey: "conflict",
        name: "Different",
      })
    ).state,
  ).toBe("conflict");
  await expect(
    call(db, ids.student, "reserve_account", { ...p, role: "administrator" }),
  ).rejects.toThrow();
});
it("finalizes expired answers durably, recovers dispatch loss, and deduplicates job claims", async () => {
  const p = fixturePaper();
  const v = await call<string>(db, ids.teacher, "publish_exam", {
    ...p,
    classId: ids.class,
  });
  const a = await call<{ id: string; writer: string }>(
    db,
    ids.peer,
    "start_attempt",
    { versionId: v },
  );
  await db.query(
    "update attempts set deadline=now()-interval '1 second'where id=$1",
    [a.id],
  );
  expect(
    await call(db, ids.peer, "save_answer", {
      attemptId: a.id,
      writer: a.writer,
      questionId: p.questions[0].id,
      response: p.keys[0].correct,
      revision: 1,
    }),
  ).toMatchObject({ error: "ATTEMPT_EXPIRED" });
  expect(
    (
      await db.query<{ status: string }>(
        "select status from attempts where id=$1",
        [a.id],
      )
    ).rows[0].status,
  ).toBe("expired");
  const dispatched = (
    await db.query<{ data: { id: string }[] }>(
      "select runtime_dispatch('{}')as data",
    )
  ).rows[0].data;
  expect(dispatched.length).toBeGreaterThan(0);
  await db.exec(
    "update outbox set lease_until=now()-interval '1 second';select runtime_sweep('{}');",
  );
  const jobs = (
    await db.query<{ data: { id: string }[] }>(
      "select runtime_dispatch('{}')as data",
    )
  ).rows[0].data;
  expect(jobs.map((j) => j.id).sort()).toEqual(
    dispatched.map((j) => j.id).sort(),
  );
  const j = jobs[0];
  expect(
    (
      await db.query<{ data: unknown }>(
        "select runtime_claim($1::jsonb)as data",
        [JSON.stringify(j)],
      )
    ).rows[0].data,
  ).not.toBeNull();
  expect(
    (
      await db.query<{ data: unknown }>(
        "select runtime_claim($1::jsonb)as data",
        [JSON.stringify(j)],
      )
    ).rows[0].data,
  ).toBeNull();
});
it("enforces active-attempt learning restrictions without automatic integrity penalties", async () => {
  const p = fixturePaper();
  const v = await call<string>(db, ids.teacher, "publish_exam", {
    ...p,
    classId: ids.class,
  });
  const a = await call<{ id: string; writer: string }>(
    db,
    ids.student,
    "start_attempt",
    { versionId: v },
  );
  await expect(call(db, ids.student, "student_progress", {})).rejects.toThrow(
    "ACTIVE_ATTEMPT_RESTRICTED",
  );
  await call(db, ids.student, "record_integrity", {
    attemptId: a.id,
    type: "visibility_loss",
  });
  expect(
    (
      await db.query<{ status: string }>(
        "select status from attempts where id=$1",
        [a.id],
      )
    ).rows[0].status,
  ).toBe("in_progress");
  await call(db, ids.student, "submit_attempt", {
    attemptId: a.id,
    writer: a.writer,
  });
});
it("separates draft revisions from approved school/public audiences", async () => {
  const profile = await call<string>(db, ids.admin, "manage_profile", {
    action: "create",
    teacherId: ids.teacher,
    displayName: "Teacher",
    subjects: ["Computing"],
    classes: ["9B"],
    reason: "Fixture",
  });
  const revision = await call<string>(db, ids.teacher, "manage_profile", {
    action: "draft",
    profileId: profile,
    content: { biography: "Synthetic teacher" },
    reason: "Fixture",
  });
  expect(await call(db, ids.student, "directory", {})).toEqual([]);
  await call(db, ids.admin, "manage_profile", {
    action: "approve",
    profileId: profile,
    revisionId: revision,
    audience: "school",
    reason: "Approved",
  });
  expect(await call(db, ids.student, "directory", {})).toHaveLength(1);
  expect(await call(db, ids.other, "directory", {})).toHaveLength(0);
  const ar = await call<string>(db, ids.teacher, "write_article", {
    profileId: profile,
    title: "Loops",
    summary: "Summary",
    subject: "Computing",
    body: "Plain text",
    state: "submitted",
  });
  const article = (
    await db.query<{ id: string }>(
      "select id from teacher_articles where profile_id=$1",
      [profile],
    )
  ).rows[0].id;
  expect(
    (await asUser(db, ids.student, "select * from article_revisions")).rows,
  ).toHaveLength(0);
  await expect(
    call(db, ids.teacher, "moderate_article", {
      articleId: article,
      revisionId: ar,
      action: "publish",
      audience: "public",
    }),
  ).rejects.toThrow();
  await call(db, ids.admin, "moderate_article", {
    articleId: article,
    revisionId: ar,
    action: "publish",
    audience: "school",
    reason: "Review",
  });
  expect(
    (await asUser(db, ids.student, "select * from article_revisions")).rows,
  ).toHaveLength(1);
  const draft = await call<string>(db, ids.teacher, "write_article", {
    profileId: profile,
    articleId: article,
    revision: 2,
    title: "New draft",
    summary: "Summary",
    subject: "Computing",
    body: "Private draft",
    state: "draft",
  });
  expect(
    (
      await asUser(
        db,
        ids.student,
        "select * from article_revisions where id=$1",
        [draft],
      )
    ).rows,
  ).toHaveLength(0);
  await call(db, ids.admin, "moderate_article", {
    articleId: article,
    action: "unpublish",
    reason: "Review",
  });
  expect(
    (await asUser(db, ids.student, "select * from article_revisions")).rows,
  ).toHaveLength(0);
});
it("rejects audit mutation and sensitive changed fields; support metadata excludes academics", async () => {
  await expect(
    asUser(db, ids.admin, "delete from audit_events"),
  ).rejects.toThrow();
  await db.query(
    "insert into private.sessions(token_hash,user_id,encrypted_provider_tokens,csrf_hash,expires_at,credential_version)values('synthetic-support-session',$1,'test-only','test-only',now()+interval '1 hour',1)",
    [ids.teacher],
  );
  const data = await call<Record<string, unknown>>(
    db,
    ids.teacher,
    "support_metadata",
    { studentId: ids.student, reason: "Connectivity" },
  );
  expect(data.scope).toBe("operational-metadata");
  expect(Object.keys(data).sort()).toEqual(
    [
      "accountActive",
      "expiresAt",
      "id",
      "provisioningState",
      "scope",
      "sessionCount",
    ].sort(),
  );
  await expect(
    call(db, ids.other, "support_metadata", {
      studentId: ids.student,
      reason: "No",
    }),
  ).rejects.toThrow();
  expect(uid(1)).toHaveLength(36);
});
it("withholds active writer tokens from direct ordinary-role reads and rejects another writer", async () => {
  const p = fixturePaper();
  const v = await call<string>(db, ids.teacher, "publish_exam", {
    ...p,
    classId: ids.class,
  });
  const a = await call<{ id: string; writer: string }>(
    db,
    ids.student,
    "start_attempt",
    { versionId: v },
  );
  await expect(
    asUser(db, ids.student, "select writer from public.attempts where id=$1", [
      a.id,
    ]),
  ).rejects.toThrow();
  await expect(
    call(db, ids.student, "start_attempt", { versionId: v, writer: ids.peer }),
  ).rejects.toThrow("WRITER_CONFLICT");
  await call(db, ids.student, "submit_attempt", {
    attemptId: a.id,
    writer: a.writer,
  });
});
it("keeps teacher staff notes out of student reports and enforces school scope", async () => {
  await call(db, ids.teacher, "save_feedback", {
    studentId: ids.student,
    classId: ids.class,
    subject: "Computing",
    visibility: "staff",
    body: "Private operational note",
  });
  await expect(
    call(db, ids.student, "staff_notes", { studentId: ids.student }),
  ).rejects.toThrow();
  await expect(
    call(db, ids.other, "staff_notes", { studentId: ids.student }),
  ).rejects.toThrow();
  expect(
    await call(db, ids.teacher, "staff_notes", { studentId: ids.student }),
  ).toHaveLength(1);
});
it("rejects malformed publication even through direct authenticated RPC calls", async () => {
  const p = fixturePaper();
  const invalid = {
    ...p,
    classId: ids.class,
    questions: [{ ...p.questions[0], options: [] }],
    keys: [p.keys[0]],
  };
  await expect(call(db, ids.teacher, "publish_exam", invalid)).rejects.toThrow(
    "INVALID_MCQ",
  );
});
it("reconciles lost upload completion and expires abandoned quota only once", async () => {
  const g = await call<string>(db, ids.teacher, "create_group", {
    classId: ids.class,
    subject: "Computing",
    title: "Files",
  });
  const post = await call<string>(db, ids.teacher, "write_post", {
    groupId: g,
    title: "File post",
    body: "File material",
  });
  const a = await call<{ id: string }>(db, ids.teacher, "reserve_upload", {
    postId: post,
    filename: "synthetic.pdf",
    type: "application/pdf",
    size: 100,
    checksum: "synthetic-checksum",
  });
  await db.query(
    "update attachments set created_at=now()-interval '25 hours'where id=$1",
    [a.id],
  );
  await db.query("select runtime_reconcile_upload($1::jsonb)", [
    JSON.stringify({ id: a.id, exists: false }),
  ]);
  await db.query("select runtime_reconcile_upload($1::jsonb)", [
    JSON.stringify({ id: a.id, exists: false }),
  ]);
  expect(
    (
      await db.query<{ state: string; charged: boolean }>(
        "select state,charged from attachments where id=$1",
        [a.id],
      )
    ).rows[0],
  ).toEqual({ state: "deleted", charged: false });
});

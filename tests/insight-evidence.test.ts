import { beforeEach, afterEach, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { database, ids, call } from "./database";
import { fixturePaper } from "./fixtures";
let db: PGlite;
beforeEach(async () => {
  db = await database();
}, 60000);
afterEach(async () => {
  await db?.close();
});
async function published() {
  const paper = fixturePaper();
  const version = await call<string>(db, ids.teacher, "publish_exam", {
    ...paper,
    classId: ids.class,
  });
  const attempt = await call<{ id: string; writer: string }>(
    db,
    ids.student,
    "start_attempt",
    { versionId: version },
  );
  await call(db, ids.student, "submit_attempt", {
    attemptId: attempt.id,
    writer: attempt.writer,
  });
  for (const q of paper.questions.filter((q) => q.type === "subjective"))
    await call(db, ids.teacher, "review_grade", {
      attemptId: attempt.id,
      questionId: q.id,
      score: 0,
      revision: 1,
      reason: "Synthetic review",
      feedback: "Released feedback",
    });
  const resultId = await call<string>(db, ids.teacher, "publish_result", {
    attemptId: attempt.id,
    reason: "Synthetic publication",
  });
  return { version, resultId };
}
async function claim() {
  return (
    await db.query<{
      data: {
        id: string;
        runToken: string;
        data: {
          sourceVersion: number;
          fingerprint: string;
          results: unknown[];
        };
      };
    }>(
      "select runtime_claim(jsonb_build_object('id',id))as data from outbox where kind='insight'and status='pending'order by (payload->>'sourceVersion')::bigint desc limit 1",
    )
  ).rows[0].data;
}
it("builds bounded published evidence without identities, keys, private notes or query content", async () => {
  const { resultId } = await published();
  const job = await claim();
  expect(job.data.results).toHaveLength(1);
  expect(JSON.stringify(job.data.results)).toContain(resultId);
  expect(JSON.stringify(job.data)).not.toMatch(
    /"(?:studentId|loginId|rubric|reference|correct|writer|credential)"\s*:/,
  );
  expect(job.data.fingerprint).toMatch(/^[a-f0-9]{32}$/);
  expect(
    (await db.query("select * from outbox where kind='insight'")).rows,
  ).toHaveLength(1);
});
it("retires obsolete jobs and invalidates current guidance immediately on eligibility changes", async () => {
  const { version } = await published();
  const oldJob = (
    await db.query<{ id: string }>("select id from outbox where kind='insight'")
  ).rows[0];
  await db.query(
    "update exam_recipients set exempt=true where version_id=$1 and student_id=$2",
    [version, ids.student],
  );
  const obsolete = (
    await db.query<{ data: unknown }>(
      "select runtime_claim($1::jsonb)as data",
      [JSON.stringify(oldJob)],
    )
  ).rows[0].data;
  expect(obsolete).toBeNull();
  const current = await claim();
  expect(current.data.results).toEqual([]);
  expect(
    (await db.query<{ status: string }>("select status from student_insights"))
      .rows[0].status,
  ).toBe("updating");
  expect(
    (await db.query("select * from private.insight_revisions")).rows.length,
  ).toBeGreaterThan(0);
});
it("requires an unchanged evidence fingerprint and persists model metadata on valid completion", async () => {
  await published();
  const job = await claim();
  const finish = {
    id: job.id,
    runToken: job.runToken,
    status: "done",
    sourceVersion: job.data.sourceVersion,
    result: { sufficiency: "result-specific" },
    model: "synthetic-test-model",
    promptVersion: "synthetic-test",
  };
  await db.query("select runtime_finish($1::jsonb)", [
    JSON.stringify({ ...finish, evidenceFingerprint: "wrong" }),
  ]);
  expect(
    (
      await db.query<{ content: unknown }>(
        "select content from student_insights",
      )
    ).rows[0].content,
  ).toBeNull();
  await db.query("update outbox set status='pending'where id=$1", [job.id]);
  const retry = await claim();
  await db.query("select runtime_finish($1::jsonb)", [
    JSON.stringify({
      ...finish,
      runToken: retry.runToken,
      evidenceFingerprint: retry.data.fingerprint,
    }),
  ]);
  expect(
    (await db.query("select status,model,prompt_version from student_insights"))
      .rows[0],
  ).toMatchObject({
    status: "ready",
    model: "synthetic-test-model",
    prompt_version: "synthetic-test",
  });
});
it("invalidates deletions and cancellations while preserving teacher correction across refreshes", async () => {
  const { resultId, version } = await published();
  await call(db, ids.teacher, "correct_insight", {
    studentId: ids.student,
    correction: "Teacher correction",
    suppressed: true,
    reason: "Misleading advice",
  });
  await db.query("update exam_versions set status='cancelled'where id=$1", [
    version,
  ]);
  expect(
    (
      await db.query(
        "select correction,suppressed,content from student_insights",
      )
    ).rows[0],
  ).toMatchObject({
    correction: "Teacher correction",
    suppressed: true,
    content: null,
  });
  await db.query("delete from private.result_revisions where result_id=$1", [
    resultId,
  ]);
  const before = Number(
    (
      await db.query<{ source_version: number }>(
        "select source_version from student_insights",
      )
    ).rows[0].source_version,
  );
  await db.query("delete from results where id=$1", [resultId]);
  expect(
    Number(
      (
        await db.query<{ source_version: number }>(
          "select source_version from student_insights",
        )
      ).rows[0].source_version,
    ),
  ).toBe(before + 1);
});

it("supplies only clean current group resources and invalidates them on membership revocation", async () => {
  await published();
  const groupId = await call<string>(db, ids.teacher, "create_group", {
    classId: ids.class,
    subject: "Computing",
    title: "Synthetic resources",
  });
  const postId = await call<string>(db, ids.teacher, "write_post", {
    groupId,
    title: "Study document",
    body: "Synthetic material",
  });
  await db.query(
    "insert into group_memberships(school_id,group_id,student_id,state)values($1,$2,$3,'active')",
    [ids.school, groupId, ids.student],
  );
  const file = await call<{ id: string }>(db, ids.teacher, "reserve_upload", {
    postId,
    filename: "practice.pdf",
    type: "application/pdf",
    size: 100,
    checksum: "synthetic-checksum",
  });
  const resources = async () =>
    (
      await db.query<{ evidence: { resources: { id: string }[] } }>(
        "select private.insight_evidence($1,$2)as evidence",
        [ids.student, ids.school],
      )
    ).rows[0].evidence.resources;
  expect(await resources()).toEqual([]);
  await db.query("update attachments set state='clean'where id=$1", [file.id]);
  expect((await resources()).map((r) => r.id)).toEqual([file.id]);
  await db.query(
    "update student_insights set status='ready',content='{}'where student_id=$1",
    [ids.student],
  );
  await db.query(
    "update group_memberships set state='removed'where group_id=$1 and student_id=$2",
    [groupId, ids.student],
  );
  expect(await resources()).toEqual([]);
  expect(
    (
      await db.query(
        "select status,content from student_insights where student_id=$1",
        [ids.student],
      )
    ).rows[0],
  ).toMatchObject({ status: "updating", content: null });
});

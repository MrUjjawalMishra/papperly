import { beforeAll, afterAll, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { database, call, asUser, ids } from "./database";
import { fixturePaper } from "./fixtures";
let db: PGlite;
beforeAll(async () => {
  db = await database();
}, 60000);
afterAll(async () => {
  await db?.close();
});
it("publishes only complete reviewed marks, preserves teacher overrides, and invalidates stale guidance", async () => {
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
  await call(db, ids.student, "submit_attempt", {
    attemptId: a.id,
    writer: a.writer,
  });
  for (const q of p.questions.filter((q) => q.type === "subjective"))
    await call(db, ids.teacher, "review_grade", {
      attemptId: a.id,
      questionId: q.id,
      score: 300,
      feedback: "Teacher-reviewed",
      revision: 1,
      reason: "Review",
    });
  await call<string>(db, ids.teacher, "publish_result", {
    attemptId: a.id,
    reason: "Publish",
  });
  expect(
    (await asUser(db, ids.student, "select * from results")).rows,
  ).toHaveLength(1);
  expect(
    (await asUser(db, ids.other, "select * from results")).rows,
  ).toHaveLength(0);
  const stats = await call<{ percentage: number; count: number }>(
    db,
    ids.student,
    "student_progress",
    {},
  );
  expect(Number(stats.percentage)).toBe(24);
  expect(Number(stats.count)).toBe(1);
  const job = (
    await db.query<{ id: string }>(
      "select id from outbox where kind='subjective'limit 1",
    )
  ).rows[0];
  const claim = (
    await db.query<{ data: { runToken: string } }>(
      "select runtime_claim($1::jsonb)as data",
      [JSON.stringify(job)],
    )
  ).rows[0].data;
  await db.query("select runtime_finish($1::jsonb)", [
    JSON.stringify({
      id: job.id,
      runToken: claim.runToken,
      status: "done",
      result: { score: 500 },
    }),
  ]);
  expect(
    (
      await db.query<{ n: number }>(
        "select min(final_score)as n from private.grades where reviewer is not null",
      )
    ).rows[0].n,
  ).toBe(300);
  const old = (
    await db.query<{ source_version: number }>(
      "select source_version from student_insights where student_id=$1",
      [ids.student],
    )
  ).rows[0].source_version;
  const q = p.questions.find((q) => q.type === "subjective")!;
  await call(db, ids.teacher, "review_grade", {
    attemptId: a.id,
    questionId: q.id,
    score: 400,
    feedback: "Correction",
    revision: 2,
    reason: "Correction",
  });
  await call(db, ids.teacher, "publish_result", {
    attemptId: a.id,
    reason: "Correction",
  });
  expect(
    (
      await db.query<{ source_version: number; status: string }>(
        "select source_version,status from student_insights where student_id=$1",
        [ids.student],
      )
    ).rows[0],
  ).toMatchObject({ source_version: old + 1, status: "updating" });
  const insight = (
    await db.query<{ id: string }>(
      "select id from outbox where kind='insight'and payload->>'studentId'=$1 order by (payload->>'sourceVersion')::bigint desc limit 1",
      [ids.student],
    )
  ).rows[0];
  const ic = (
    await db.query<{ data: { runToken: string } }>(
      "select runtime_claim($1::jsonb)as data",
      [JSON.stringify(insight)],
    )
  ).rows[0].data;
  await db.query("select runtime_finish($1::jsonb)", [
    JSON.stringify({
      id: insight.id,
      runToken: ic.runToken,
      status: "done",
      sourceVersion: old,
      result: { text: "stale" },
    }),
  ]);
  expect(
    (
      await db.query<{ content: unknown }>(
        "select content from student_insights where student_id=$1",
        [ids.student],
      )
    ).rows[0].content,
  ).toBeNull();
});

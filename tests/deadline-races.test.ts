import { beforeEach, afterEach, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { setTimeout as delay } from "node:timers/promises";
import { database, ids, call, claims } from "./database";
import { fixturePaper } from "./fixtures";
let db: PGlite;
beforeEach(async () => {
  db = await database();
}, 60000);
afterEach(async () => {
  await db?.close();
});
async function attempt() {
  const paper = fixturePaper(),
    version = await call<string>(db, ids.teacher, "publish_exam", {
      ...paper,
      classId: ids.class,
    });
  const a = await call<{ id: string; writer: string }>(
    db,
    ids.student,
    "start_attempt",
    { versionId: version },
  );
  return { paper, a };
}
it("denies a save when the transaction began before the deadline but execution resumed after it", async () => {
  const { paper, a } = await attempt();
  await db.exec("begin");
  try {
    await db.query(
      "update attempts set deadline=clock_timestamp()+interval '150 milliseconds'where id=$1",
      [a.id],
    );
    await delay(250);
    const result = await call<{ error?: string }>(
      db,
      ids.student,
      "save_answer",
      {
        attemptId: a.id,
        questionId: paper.questions[0].id,
        writer: a.writer,
        revision: 1,
        response: paper.keys[0].correct,
      },
    );
    expect(result.error).toBe("ATTEMPT_EXPIRED");
    expect(
      (await db.query("select * from answers where attempt_id=$1", [a.id]))
        .rows,
    ).toHaveLength(0);
  } finally {
    await db.exec("rollback");
    await db.exec("reset role");
  }
});
it("classifies a late submission using the clock after lock acquisition, not transaction start", async () => {
  const { a } = await attempt();
  await db.exec("begin");
  try {
    await db.query(
      "update attempts set deadline=clock_timestamp()+interval '150 milliseconds'where id=$1",
      [a.id],
    );
    await delay(250);
    const submitted = await call<{ status: string; receipt: string }>(
      db,
      ids.student,
      "submit_attempt",
      { attemptId: a.id, writer: a.writer },
    );
    expect(submitted.status).toBe("expired");
    expect(submitted.receipt).toBeTruthy();
  } finally {
    await db.exec("rollback");
    await db.exec("reset role");
  }
});
it("does not admit a new attempt after last-start time because its transaction is old", async () => {
  const paper = fixturePaper();
  paper.lastStartAt = new Date(Date.now() + 400).toISOString();
  const version = await call<string>(db, ids.teacher, "publish_exam", {
    ...paper,
    classId: ids.class,
  });
  await db.exec("begin");
  try {
    await delay(500);
    await db.exec("set role authenticated");
    await claims(db, ids.student);
    await expect(
      db.query("select start_attempt($1::jsonb)", [
        JSON.stringify({ versionId: version, writer: ids.student }),
      ]),
    ).rejects.toThrow("ATTEMPT_UNAVAILABLE");
  } finally {
    await db.exec("rollback");
    await db.exec("reset role");
  }
});
it("requires a writer even through direct RPC and hides its token from table/finalized reads", async () => {
  const { paper, a } = await attempt();
  const denied = await call<{ error: string }>(db, ids.student, "save_answer", {
    attemptId: a.id,
    questionId: paper.questions[0].id,
    revision: 1,
    response: paper.keys[0].correct,
  });
  expect(denied.error).toBe("WRITER_CONFLICT");
  await expect(
    call(db, ids.student, "submit_attempt", { attemptId: a.id }),
  ).rejects.toThrow("WRITER_CONFLICT");
  const { asUser } = await import("./database");
  await expect(
    asUser(db, ids.student, "select writer from attempts where id=$1", [a.id]),
  ).rejects.toThrow("permission denied");
  expect(
    (
      await asUser(
        db,
        ids.student,
        "select id,deadline,status from attempts where id=$1",
        [a.id],
      )
    ).rows,
  ).toHaveLength(1);
  const done = await call<Record<string, unknown>>(
    db,
    ids.student,
    "submit_attempt",
    { attemptId: a.id, writer: a.writer },
  );
  expect(done.writer).toBeUndefined();
});
it("keeps future/unstarted questions hidden from ordinary recipients until their own attempt is admitted", async () => {
  const { asUser } = await import("./database");
  const paper = fixturePaper();
  const versionId = await call<string>(db, ids.teacher, "publish_exam", {
    ...paper,
    classId: ids.class,
  });
  expect(
    (
      await asUser(
        db,
        ids.student,
        "select id from exam_versions where id=$1",
        [versionId],
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await asUser(
        db,
        ids.student,
        "select id from exam_questions where version_id=$1",
        [versionId],
      )
    ).rows,
  ).toHaveLength(0);
  await call(db, ids.student, "start_attempt", { versionId });
  expect(
    (
      await asUser(
        db,
        ids.student,
        "select id from exam_questions where version_id=$1",
        [versionId],
      )
    ).rows,
  ).toHaveLength(paper.questions.length);
  expect(
    (
      await asUser(
        db,
        ids.peer,
        "select id from exam_questions where version_id=$1",
        [versionId],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await asUser(
        db,
        ids.teacher,
        "select id from exam_questions where version_id=$1",
        [versionId],
      )
    ).rows,
  ).toHaveLength(paper.questions.length);
});

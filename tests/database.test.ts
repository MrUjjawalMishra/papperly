import { beforeAll, afterAll, describe, it, expect } from "vitest";
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
describe("ordinary authenticated database roles", () => {
  it("recreates every migration and denies cross-school roster reads and direct writes", async () => {
    expect(
      (await asUser(db, ids.other, "select * from public.enrollments")).rows,
    ).toEqual([]);
    await expect(
      asUser(
        db,
        ids.student,
        "update public.memberships set role='owner' where id=$1",
        [ids.student],
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, ids.student, "select * from private.question_keys"),
    ).rejects.toThrow();
    await expect(
      asUser(db, ids.student, "select public.runtime_dispatch('{}')"),
    ).rejects.toThrow();
  });
  it("enforces immutable exam, recipient, revision, writer and idempotent finalization rules", async () => {
    const p = fixturePaper();
    const v = await call<string>(db, ids.teacher, "publish_exam", {
      ...p,
      classId: ids.class,
    });
    await expect(
      call(db, ids.other, "start_attempt", { versionId: v }),
    ).rejects.toThrow();
    const a = await call<{
      id: string;
      writer: string;
      deadline: string;
      display_order: unknown;
    }>(db, ids.student, "start_attempt", { versionId: v });
    expect(
      (
        await call<{ id: string }>(db, ids.student, "start_attempt", {
          versionId: v,
        })
      ).id,
    ).toBe(a.id);
    expect(
      (await asUser(db, ids.student, "select * from public.results")).rows,
    ).toHaveLength(0);
    const save = {
      attemptId: a.id,
      questionId: p.questions[0].id,
      response: p.keys[0].correct,
      revision: 1,
      writer: a.writer,
    };
    await call(db, ids.student, "save_answer", save);
    expect(
      await call(db, ids.student, "save_answer", {
        ...save,
        response: "changed",
      }),
    ).toMatchObject({ error: "STALE_REVISION" });
    expect(
      await call(db, ids.student, "save_answer", {
        ...save,
        writer: ids.peer,
        revision: 2,
      }),
    ).toMatchObject({ error: "WRITER_CONFLICT" });
    expect(
      (await asUser(db, ids.student, "select * from public.answers")).rows,
    ).toHaveLength(1);
    const receipt = await call<{ receipt: string }>(
      db,
      ids.student,
      "submit_attempt",
      { attemptId: a.id, writer: a.writer },
    );
    expect(
      (
        await call<{ receipt: string }>(db, ids.student, "submit_attempt", {
          attemptId: a.id,
          writer: a.writer,
        })
      ).receipt,
    ).toBe(receipt.receipt);
    expect(
      await call(db, ids.student, "save_answer", { ...save, revision: 2 }),
    ).toMatchObject({ error: "ATTEMPT_FINALIZED" });
    await expect(
      call(db, ids.teacher, "publish_result", {
        attemptId: a.id,
        reason: "test",
      }),
    ).rejects.toThrow("UNREVIEWED");
    const grades = await db.query(
      "select * from private.grades where attempt_id=$1",
      [a.id],
    );
    expect(grades.rows).toHaveLength(14);
    expect(
      (grades.rows[0] as { objective_score: number }).objective_score,
    ).toBe(100);
  });
  it("blocks student posting and revokes group access immediately", async () => {
    const g = await call<string>(db, ids.teacher, "create_group", {
      classId: ids.class,
      subject: "Computing",
      title: "9B",
    });
    await call(db, ids.student, "set_group_member", {
      groupId: g,
      studentId: ids.student,
      state: "pending",
    });
    expect(
      (await asUser(db, ids.student, "select * from public.groups")).rows,
    ).toHaveLength(0);
    await call(db, ids.teacher, "set_group_member", {
      groupId: g,
      studentId: ids.student,
      state: "active",
    });
    await call(db, ids.teacher, "write_post", {
      groupId: g,
      title: "Hello",
      body: "Material",
    });
    expect(
      (await asUser(db, ids.student, "select * from public.posts")).rows,
    ).toHaveLength(1);
    await expect(
      call(db, ids.student, "write_post", {
        groupId: g,
        title: "No",
        body: "No",
      }),
    ).rejects.toThrow();
    await call(db, ids.teacher, "set_group_member", {
      groupId: g,
      studentId: ids.student,
      state: "removed",
    });
    expect(
      (await asUser(db, ids.student, "select * from public.posts")).rows,
    ).toHaveLength(0);
  });
  it("preserves exact query targets, private replies, original deadlines and cycles", async () => {
    await call(db, ids.teacher, "set_query_policy", {
      classId: ids.class,
      subject: "Computing",
      hours: 168,
    });
    const q = await call<string>(db, ids.student, "create_query", {
      teacherId: ids.teacher,
      classId: ids.class,
      subject: "Computing",
      topic: "Loops",
      body: "Help",
    });
    const cycle = (
      await db.query<{ hours: number; original_due_at: string }>(
        "select extract(epoch from due_at-started_at)/3600 as hours,original_due_at from query_cycles where query_id=$1",
        [q],
      )
    ).rows[0];
    expect(Number(cycle.hours)).toBe(168);
    expect(
      (await asUser(db, ids.peer, "select * from public.query_messages")).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(db, ids.admin, "select * from public.query_messages")).rows,
    ).toHaveLength(0);
    await call(db, ids.teacher, "reply_query", {
      queryId: q,
      kind: "reply",
      body: "Acknowledged",
    });
    expect(
      (
        await db.query<{ state: string }>(
          "select state from queries where id=$1",
          [q],
        )
      ).rows[0].state,
    ).toBe("in_progress");
    await call(db, ids.teacher, "revise_deadline", {
      queryId: q,
      dueAt: new Date(Date.now() + 200 * 3600000).toISOString(),
      revision: 1,
      reason: "More time",
    });
    expect(
      (
        await db.query<{ original_due_at: string }>(
          "select original_due_at from query_cycles where query_id=$1",
          [q],
        )
      ).rows[0].original_due_at,
    ).toEqual(cycle.original_due_at);
    await call(db, ids.teacher, "reply_query", {
      queryId: q,
      kind: "solution",
      body: "A substantive answer",
    });
    await call(db, ids.student, "reply_query", {
      queryId: q,
      kind: "clarification",
      body: "Why?",
    });
    expect(
      (await db.query("select * from query_cycles where query_id=$1", [q]))
        .rows,
    ).toHaveLength(2);
  });
});

import { beforeEach, afterEach, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { database, call, ids } from "./database";
import { fixturePaper } from "./fixtures";
let db: PGlite;
beforeEach(async () => {
  db = await database();
}, 60000);
afterEach(async () => {
  await db?.close();
});
type Report = {
  count: number;
  percentage: number | null;
  sourceFingerprint: string;
  results: { id: string; subject: string }[];
  enrollmentHistory: { active: boolean }[];
  assignments: { state: string }[];
  feedback: { body: string }[];
  queryMetadata: object[];
  groups: object[];
  guidance: unknown;
  topics: object[];
};
async function exam(subject = "Computing") {
  const paper = fixturePaper();
  const versionId = await call<string>(db, ids.teacher, "publish_exam", {
    ...paper,
    subject,
    classId: ids.class,
  });
  const attempt = await call<{ id: string; writer: string }>(
    db,
    ids.student,
    "start_attempt",
    { versionId },
  );
  await call(db, ids.student, "submit_attempt", {
    attemptId: attempt.id,
    writer: attempt.writer,
  });
  return { paper, versionId, attempt };
}
it("distinguishes unpublished marks from zero and preserves authorized historical enrollment", async () => {
  const { paper, attempt } = await exam();
  const pending = await call<Report>(db, ids.student, "student_progress", {});
  expect(pending.assignments[0].state).toBe("awaiting_marks");
  expect(pending.count).toBe(0);
  expect(pending.percentage).toBeNull();
  for (const q of paper.questions.filter((q) => q.type === "subjective"))
    await call(db, ids.teacher, "review_grade", {
      attemptId: attempt.id,
      questionId: q.id,
      score: 0,
      feedback: "Reviewed",
      revision: 1,
      reason: "Review",
    });
  await call(db, ids.teacher, "publish_result", {
    attemptId: attempt.id,
    reason: "Release",
  });
  await db.query("update enrollments set active=false where student_id=$1", [
    ids.student,
  ]);
  await db.query("update memberships set active=false where id=$1", [
    ids.student,
  ]);
  const report = await call<Report>(db, ids.admin, "student_progress", {
    studentId: ids.student,
    academicYear: "2026",
  });
  expect(report.count).toBe(1);
  expect(Number(report.percentage)).toBe(0);
  expect(report.assignments[0].state).toBe("published");
  expect(report.enrollmentHistory[0].active).toBe(false);
  expect(report.topics.length).toBeGreaterThan(0);
  await expect(call(db, ids.student, "student_progress", {})).rejects.toThrow(
    "FORBIDDEN",
  );
});
it("returns query metadata and released feedback without raw private conversation or staff notes", async () => {
  await call(db, ids.teacher, "set_query_policy", {
    classId: ids.class,
    subject: "Computing",
    hours: 24,
  });
  await call(db, ids.student, "create_query", {
    classId: ids.class,
    teacherId: ids.teacher,
    subject: "Computing",
    topic: "Private topic sentinel",
    body: "Private body sentinel",
  });
  await db.query(
    "insert into teacher_feedback(school_id,student_id,teacher_id,class_id,subject,body) values($1,$2,$3,$4,'Computing','Released feedback')",
    [ids.school, ids.student, ids.teacher, ids.class],
  );
  await db.query(
    "insert into private.support_notes(school_id,student_id,teacher_id,body) values($1,$2,$3,'Staff note sentinel')",
    [ids.school, ids.student, ids.teacher],
  );
  for (const actor of [ids.admin, ids.student, ids.teacher]) {
    const report = await call<Report>(db, actor, "student_progress", {
      studentId: ids.student,
    });
    expect(report.queryMetadata).toHaveLength(1);
    expect(report.feedback[0].body).toBe("Released feedback");
    expect(JSON.stringify(report)).not.toMatch(
      /Private body sentinel|Private topic sentinel|Staff note sentinel/,
    );
  }
});
it("filters by school, current assignment, subject, year and period; denies owner and peers", async () => {
  await db.query(
    "insert into teacher_feedback(school_id,student_id,teacher_id,class_id,subject,body) values($1,$2,$3,$4,'History','History sentinel'),($1,$2,$3,$4,'Computing','Computing feedback')",
    [ids.school, ids.student, ids.teacher, ids.class],
  );
  const teacher = await call<Report>(db, ids.teacher, "student_progress", {
    studentId: ids.student,
  });
  expect(teacher.feedback.map((f) => f.body)).toEqual(["Computing feedback"]);
  expect(teacher.guidance).toBeNull();
  expect(
    (
      await call<Report>(db, ids.admin, "student_progress", {
        studentId: ids.student,
        subject: "History",
      })
    ).feedback[0].body,
  ).toBe("History sentinel");
  expect(
    (
      await call<Report>(db, ids.admin, "student_progress", {
        studentId: ids.student,
        academicYear: "1900",
      })
    ).feedback,
  ).toEqual([]);
  for (const actor of [ids.peer, ids.other, ids.owner])
    await expect(
      call(db, actor, "student_progress", { studentId: ids.student }),
    ).rejects.toThrow("FORBIDDEN");
  await expect(
    call(db, ids.admin, "student_progress", {
      studentId: ids.student,
      from: "2026-02-01T00:00:00Z",
      to: "2026-01-01T00:00:00Z",
    }),
  ).rejects.toThrow("INVALID_PERIOD");
});
it("uses stable fingerprints and deterministic bounded pages", async () => {
  for (let i = 0; i < 3; i++)
    await db.query(
      "insert into teacher_feedback(school_id,student_id,teacher_id,class_id,subject,body) values($1,$2,$3,$4,'Computing',$5)",
      [ids.school, ids.student, ids.teacher, ids.class, `Feedback ${i}`],
    );
  const p = { studentId: ids.student, limit: 1, offset: 0 };
  const first = await call<Report>(db, ids.admin, "student_progress", p);
  const repeat = await call<Report>(db, ids.admin, "student_progress", p);
  const next = await call<Report>(db, ids.admin, "student_progress", {
    ...p,
    offset: 1,
  });
  expect(first.sourceFingerprint).toBe(repeat.sourceFingerprint);
  expect(first.feedback).toHaveLength(1);
  expect(next.feedback[0].body).not.toBe(first.feedback[0].body);
});
it("invalidates exports after out-of-page feedback or assignment access changes and restores background identity", async () => {
  const p = { studentId: ids.student, format: "csv" };
  const exportId = await call<string>(db, ids.teacher, "request_export", p);
  const data = (
    await db.query<{ data: { sourceFingerprint: string; data: Report } }>(
      "select runtime_export_data($1::jsonb) as data",
      [JSON.stringify({ id: exportId })],
    )
  ).rows[0].data;
  expect(data.data.count).toBe(0);
  expect(
    (
      await db.query<{ sub: string }>(
        "select current_setting('request.jwt.claim.sub',true) as sub",
      )
    ).rows[0].sub,
  ).toBe("");
  await db.query("select runtime_export_finish($1::jsonb)", [
    JSON.stringify({
      id: exportId,
      objectKey: "private/report.csv",
      sourceFingerprint: data.sourceFingerprint,
    }),
  ]);
  expect(
    await call(db, ids.teacher, "export_download", { id: exportId }),
  ).toMatchObject({ objectKey: "private/report.csv", format: "csv" });
  await expect(
    call(db, ids.other, "export_download", { id: exportId }),
  ).rejects.toThrow("EXPORT_UNAVAILABLE");
  await db.query(
    "insert into teacher_feedback(school_id,student_id,teacher_id,class_id,subject,body)values($1,$2,$3,$4,'Computing','New report data')",
    [ids.school, ids.student, ids.teacher, ids.class],
  );
  await expect(
    call(db, ids.teacher, "export_download", { id: exportId }),
  ).rejects.toThrow("EXPORT_UNAVAILABLE");
  const another = await call<string>(db, ids.teacher, "request_export", p);
  await db.query("delete from teacher_assignments where teacher_id=$1", [
    ids.teacher,
  ]);
  await expect(
    db.query("select runtime_export_data($1::jsonb)", [
      JSON.stringify({ id: another }),
    ]),
  ).rejects.toThrow("FORBIDDEN");
  expect(
    (
      await db.query<{ sub: string }>(
        "select current_setting('request.jwt.claim.sub',true) as sub",
      )
    ).rows[0].sub,
  ).toBe("");
});
it("exports every authorized page and rejects stale generation before publication", async () => {
  await db.query(
    "insert into teacher_feedback(school_id,student_id,teacher_id,class_id,subject,body)select $1,$2,$3,$4,'Computing','Feedback '||i from generate_series(1,105)i",
    [ids.school, ids.student, ids.teacher, ids.class],
  );
  const id = await call<string>(db, ids.admin, "request_export", {
    studentId: ids.student,
    format: "printable",
  });
  const report = (
    await db.query<{ data: { sourceFingerprint: string; data: Report } }>(
      "select runtime_export_data($1::jsonb)as data",
      [JSON.stringify({ id })],
    )
  ).rows[0].data;
  expect(report.data.feedback).toHaveLength(105);
  await db.query("update enrollments set roll='updated' where student_id=$1", [
    ids.student,
  ]);
  await expect(
    db.query("select runtime_export_finish($1::jsonb)", [
      JSON.stringify({
        id,
        objectKey: "private/report.txt",
        sourceFingerprint: report.sourceFingerprint,
      }),
    ]),
  ).rejects.toThrow("EXPORT_STALE");
});
it("uses school-approved term bounds, rejects foreign terms and revision conflicts", async () => {
  const input = {
    academicYear: "2026",
    name: "Autumn",
    startsAt: "2026-01-01T00:00:00Z",
    endsAt: "2027-01-01T00:00:00Z",
    reason: "Academic calendar",
  };
  const termId = await call<string>(db, ids.admin, "manage_term", input);
  const report = await call<{
    filters: { academicYear: string; from: string; to: string };
  }>(db, ids.student, "student_progress", { termId });
  expect(report.filters.academicYear).toBe("2026");
  expect(Date.parse(report.filters.from)).toBe(Date.parse(input.startsAt));
  await expect(call(db, ids.teacher, "manage_term", input)).rejects.toThrow(
    "FORBIDDEN",
  );
  await expect(
    call(db, ids.other, "student_progress", { termId }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    call(db, ids.student, "student_progress", { termId, academicYear: "2025" }),
  ).rejects.toThrow("INVALID_PERIOD");
  await call(db, ids.admin, "manage_term", {
    ...input,
    id: termId,
    revision: 1,
    name: "Revised autumn",
  });
  await expect(
    call(db, ids.admin, "manage_term", { ...input, id: termId, revision: 1 }),
  ).rejects.toThrow("STALE_REVISION");
});
it("keeps period/class-filtered completion denominators distinct from missing marks and exemptions", async () => {
  const paper = fixturePaper();
  const versionId = await call<string>(db, ids.teacher, "publish_exam", {
    ...paper,
    classId: ids.class,
  });
  await db.query(
    "update exam_recipients set closes_at=now()-interval '1 day'where version_id=$1",
    [versionId],
  );
  const first = await call<{
    eligibleClosedAssignments: number;
    completionRate: null;
  }>(db, ids.student, "learning_statistics", {});
  expect(first.eligibleClosedAssignments).toBe(1);
  expect(Number(first.completionRate)).toBe(0);
  const report = await call<Report>(db, ids.student, "student_progress", {});
  expect(report.assignments[0].state).toBe("missing_submission");
  const filtered = await call<{
    eligibleClosedAssignments: number;
    completionRate: null;
  }>(db, ids.student, "learning_statistics", {
    from: new Date().toISOString(),
    academicYear: "2026",
  });
  expect(filtered.eligibleClosedAssignments).toBe(0);
  expect(filtered.completionRate).toBeNull();
  await db.query(
    "update exam_recipients set exempt=true where version_id=$1 and student_id=$2",
    [versionId, ids.student],
  );
  expect(
    (await call<Report>(db, ids.student, "student_progress", {})).assignments[0]
      .state,
  ).toBe("exempt");
  expect(
    (
      await call<{ eligibleClosedAssignments: number }>(
        db,
        ids.student,
        "learning_statistics",
        {},
      )
    ).eligibleClosedAssignments,
  ).toBe(0);
});

import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { database, call, ids } from "../tests/database";
import { fixturePaper, uid } from "../tests/fixtures";
const db = await database();
try {
  const students = Array.from({ length: 50 }, (_, i) => uid(2000 + i));
  const otherTeacher = uid(2100),
    otherClass = uid(2101);
  await db.query(
    "insert into memberships(id,school_id,role,display_name)values($1,$2,'teacher','Synthetic second-school teacher')",
    [otherTeacher, ids.otherSchool],
  );
  await db.query(
    "insert into classes(id,school_id,academic_year,name,section)values($1,$2,'2026','9','B')",
    [otherClass, ids.otherSchool],
  );
  await db.query(
    "insert into teacher_assignments values($1,$2,$3,'Computing')",
    [ids.otherSchool, otherTeacher, otherClass],
  );
  for (let i = 0; i < 50; i++) {
    const school = i < 25 ? ids.school : ids.otherSchool,
      c = i < 25 ? ids.class : otherClass;
    await db.query(
      "insert into memberships(id,school_id,role,display_name)values($1,$2,'student','Synthetic load student')",
      [students[i], school],
    );
    await db.query(
      "insert into student_registry(student_id,school_id)values($1,$2)",
      [students[i], school],
    );
    await db.query("insert into enrollments values($1,$2,$3,$4,true)", [
      school,
      c,
      students[i],
      String(100 + i),
    ]);
  }
  const versions = [];
  for (let i = 0; i < 2; i++) {
    const p = fixturePaper();
    versions.push(
      await call<string>(db, i ? otherTeacher : ids.teacher, "publish_exam", {
        ...p,
        classId: i ? otherClass : ids.class,
        recipients: students
          .slice(i * 25, (i + 1) * 25)
          .map((studentId) => ({ studentId, extraSeconds: 0, closesAt: null })),
      }),
    );
  }
  const attempts = [];
  for (let i = 0; i < 50; i++)
    attempts.push(
      await call<{ id: string; writer: string }>(
        db,
        students[i],
        "start_attempt",
        { versionId: versions[i < 25 ? 0 : 1], writer: uid(2200 + i) },
      ),
    );
  // One PostgreSQL/WASM connection serializes these requests. This measures the
  // local queue and SQL path, not native DB lock races or Cloudflare HTTP latency.
  const durations: number[] = [],
    failures: string[] = [];
  let serial = Promise.resolve();
  const started = performance.now();
  await Promise.all(
    students.map((student, i) => {
      const since = performance.now();
      const task = serial.then(async () => {
        try {
          const p = fixturePaper();
          await call(db, student, "save_answer", {
            attemptId: attempts[i].id,
            writer: attempts[i].writer,
            questionId: p.questions[0].id,
            response: p.keys[0].correct,
            revision: 1,
          });
          await call(db, student, "submit_attempt", {
            attemptId: attempts[i].id,
            writer: attempts[i].writer,
          });
        } catch (e) {
          failures.push(e instanceof Error ? e.message : "failure");
        } finally {
          durations.push(performance.now() - since);
        }
      });
      serial = task.then(() => undefined);
      return task;
    }),
  );
  await db.exec("select runtime_sweep('{}');select runtime_dispatch('{}');");
  durations.sort((a, b) => a - b);
  const evidence = {
    environment:
      "Node 24 / PGlite PostgreSQL WASM, one serialized connection, no HTTP/Cloudflare/provider services",
    students: 50,
    schools: 2,
    totalMilliseconds: performance.now() - started,
    p50QueuedWorkflowMilliseconds: durations[24],
    p95QueuedWorkflowMilliseconds: durations[47],
    p99QueuedWorkflowMilliseconds: durations[49],
    failures,
    backgroundJobs: Number(
      (await db.query<{ n: number }>("select count(*)as n from outbox")).rows[0]
        .n,
    ),
    limitations:
      "Save+submit combined per student, includes local queue wait. No parallel native sessions, network, imports, scanner, or AI; not the PRD pilot and not evidence the under-2-second target passed.",
  };
  writeFileSync(
    "docs/local-load-evidence.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence));
  if (failures.length) throw Error("Local load exercise failed");
} finally {
  await db.close();
}

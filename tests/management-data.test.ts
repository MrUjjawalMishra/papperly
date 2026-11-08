import { beforeEach, afterEach, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { database, ids, call, asUser } from "./database";
import { fixturePaper } from "./fixtures";
import { readTables } from "../apps/api/src/routes";
let db: PGlite;
beforeEach(async () => {
  db = await database();
}, 60000);
afterEach(async () => {
  await db?.close();
});
it("returns authorized roster/login metadata without passwords and rejects peer/foreign/owner enumeration", async () => {
  await db.query(
    "insert into private.login_identifiers(school_id,normalized,display,user_id)values($1,'student.login','Student.Login',$2)",
    [ids.school, ids.student],
  );
  const rows = await call<{ id: string; loginId: string }[]>(
    db,
    ids.teacher,
    "student_roster",
    { classId: ids.class },
  );
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.id === ids.student)?.loginId).toBe("Student.Login");
  expect(JSON.stringify(rows)).not.toMatch(/password|token|credential/i);
  for (const actor of [ids.student, ids.other, ids.owner])
    await expect(call(db, actor, "student_roster", {})).rejects.toThrow(
      "FORBIDDEN",
    );
  expect(
    await call(db, ids.teacher, "student_roster", {
      classId: crypto.randomUUID(),
    }),
  ).toEqual([]);
});
it("preserves UUID and recipient snapshots on a class move, removes old group access and rejects stale moves", async () => {
  const group = await call<string>(db, ids.teacher, "create_group", {
    classId: ids.class,
    subject: "Computing",
    title: "Original class",
  });
  await call(db, ids.teacher, "set_group_member", {
    groupId: group,
    studentId: ids.student,
    state: "active",
  });
  const version = await call<string>(db, ids.teacher, "publish_exam", {
    ...fixturePaper(),
    classId: ids.class,
  });
  const next = crypto.randomUUID();
  await db.query(
    "insert into classes(id,school_id,academic_year,name,section)values($1,$2,'2027','10','B')",
    [next, ids.school],
  );
  const input = {
    studentId: ids.student,
    fromClassId: ids.class,
    toClassId: next,
    roll: "01",
    revision: 1,
    reason: "School promotion",
  };
  await expect(call(db, ids.teacher, "move_student", input)).rejects.toThrow(
    "FORBIDDEN",
  );
  await call(db, ids.admin, "move_student", input);
  expect(
    (
      await db.query<{ active: boolean }>(
        "select active from enrollments where student_id=$1 and class_id=$2",
        [ids.student, ids.class],
      )
    ).rows[0].active,
  ).toBe(false);
  expect(
    (
      await db.query<{ student_id: string }>(
        "select student_id from enrollments where class_id=$1",
        [next],
      )
    ).rows[0].student_id,
  ).toBe(ids.student);
  expect(
    (
      await db.query<{ state: string }>(
        "select state from group_memberships where group_id=$1",
        [group],
      )
    ).rows[0].state,
  ).toBe("removed");
  expect(
    (
      await db.query(
        "select * from group_memberships gm join groups g on g.id=gm.group_id where g.class_id=$1",
        [next],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "select * from exam_recipients where version_id=$1 and student_id=$2",
        [version, ids.student],
      )
    ).rows,
  ).toHaveLength(1);
  await expect(call(db, ids.admin, "move_student", input)).rejects.toThrow(
    "STALE_REVISION",
  );
});
it("requires profile revisions and revokes unassigned teachers' roster and group permissions", async () => {
  await call(db, ids.teacher, "edit_student", {
    studentId: ids.student,
    name: "Updated student",
    revision: 1,
    reason: "Roster correction",
  });
  await expect(
    call(db, ids.teacher, "edit_student", {
      studentId: ids.student,
      name: "Stale update",
      revision: 1,
      reason: "Old edit",
    }),
  ).rejects.toThrow("STALE_REVISION");
  const directory = await call<unknown[]>(
    db,
    ids.student,
    "assigned_directory",
    {},
  );
  expect(directory).toHaveLength(1);
  await call(db, ids.admin, "remove_assignment", {
    teacherId: ids.teacher,
    classId: ids.class,
    subject: "Computing",
    reason: "Replacement teacher",
  });
  expect(await call(db, ids.teacher, "student_roster", {})).toEqual([]);
  expect(await call(db, ids.student, "assigned_directory", {})).toEqual([]);
});
it("keeps factual profile fields school-controlled and derived assignments authoritative", async () => {
  const profile = await call<string>(db, ids.admin, "manage_profile", {
    action: "create",
    teacherId: ids.teacher,
    displayName: "Teacher",
    designation: "Teacher",
    subjects: ["Invented"],
    classes: ["Invented"],
    reason: "Directory",
  });
  const own = async () =>
    (
      await db.query<{
        subjects: string[];
        classes: string[];
        revision: number;
        approved_fields: unknown;
      }>("select * from teacher_profiles where id=$1", [profile])
    ).rows[0];
  expect((await own()).subjects).toEqual(["Computing"]);
  expect((await own()).classes).toEqual(["9B"]);
  await expect(
    call(db, ids.teacher, "update_profile_details", {
      profileId: profile,
      revision: 1,
      displayName: "Changed",
      designation: "Teacher",
      qualifications: "Unverified",
      experience: "Unverified",
      reason: "Denied",
    }),
  ).rejects.toThrow("FORBIDDEN");
  await call(db, ids.admin, "update_profile_details", {
    profileId: profile,
    revision: 1,
    displayName: "Approved teacher",
    designation: "Senior teacher",
    qualifications: "School verified",
    experience: "School verified",
    reason: "Verified record",
  });
  const revision = await call<string>(db, ids.teacher, "manage_profile", {
    action: "draft",
    profileId: profile,
    content: {
      biography: "Teacher biography",
      teachingApproach: "Examples",
      qualifications: "Attempted overwrite",
      experience: "Attempted overwrite",
    },
    reason: "Biography",
  });
  await call(db, ids.admin, "manage_profile", {
    action: "approve",
    profileId: profile,
    revisionId: revision,
    audience: "school",
    reason: "Approve biography",
  });
  expect((await own()).approved_fields).toMatchObject({
    qualifications: "School verified",
    biography: "Teacher biography",
  });
});
it("exposes authoring drafts only to their teacher and excludes internal credentials from list projections", async () => {
  const id = await call<string>(db, ids.teacher, "save_question_draft", {
    rawText: "Synthetic question",
    content: { questions: [] },
  });
  expect(
    (
      await asUser(
        db,
        ids.teacher,
        "select id,content from question_drafts where id=$1",
        [id],
      )
    ).rows,
  ).toHaveLength(1);
  for (const user of [ids.student, ids.other, ids.admin])
    expect(
      (
        await asUser(db, user, "select id from question_drafts where id=$1", [
          id,
        ])
      ).rows,
    ).toHaveLength(0);
  expect(readTables.users.select).not.toMatch(/credential|password|token/);
});

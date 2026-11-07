import { writeFileSync } from "node:fs";
import { fixturePaper, uid } from "../tests/fixtures";
import { ids } from "../tests/database";
const q = (v: unknown) => "'" + String(v).replaceAll("'", "''") + "'";
let sql =
  "-- SYNTHETIC DEVELOPMENT ONLY. No Auth credentials are created. Never run against real school data.\n";
sql += `insert into schools(id,code,name)values('${ids.school}','oak','Oak Demonstration School'),('${ids.otherSchool}','pine','Pine Demonstration School');\n`;
sql +=
  "insert into subscriptions(school_id,plan,starts_at,ends_at,teacher_limit,student_limit,ai_limit)select id,'Synthetic',now()-interval '1 day',now()+interval '1 year',10,100,100 from schools;\n";
sql += `insert into memberships(id,role,display_name)values('${ids.owner}','owner','Synthetic Platform Owner');\n`;
const students: string[][] = [];
for (let school = 0; school < 2; school++) {
  const schoolId = school ? ids.otherSchool : ids.school;
  const admin = school ? uid(500) : ids.admin;
  const teachers = school ? [uid(501), uid(502)] : [ids.teacher, uid(503)];
  const classId = school ? uid(510) : ids.class;
  const roster = Array.from({ length: 5 }, (_, i) =>
    school
      ? uid(520 + i)
      : i === 0
        ? ids.student
        : i === 1
          ? ids.peer
          : uid(530 + i),
  );
  students.push(roster);
  for (const [id, role, name] of [
    [admin, "administrator", "Synthetic Administrator"],
    ...teachers.map((id, i) => [id, "teacher", "Synthetic Teacher " + (i + 1)]),
    ...roster.map((id, i) => [id, "student", "Fictional Student " + (i + 1)]),
  ])
    sql += `insert into memberships(id,school_id,role,display_name,credential_policy)values(${q(id)},${q(schoolId)},${q(role)},${q(name)},${q(role === "student" ? "name-roster-ascii-fold-v1" : "case-sensitive-v1")});\n`;
  sql += `insert into classes(id,school_id,academic_year,name,section)values(${q(classId)},${q(schoolId)},'2026','9','B');\n`;
  for (const t of teachers)
    sql += `insert into teacher_assignments values(${q(schoolId)},${q(t)},${q(classId)},'Computing');\n`;
  roster.forEach((id, i) => {
    sql += `insert into student_registry(student_id,school_id,admission_number)values(${q(id)},${q(schoolId)},${q("DEMO-" + (i + 1))});\ninsert into enrollments values(${q(schoolId)},${q(classId)},${q(id)},${q(String(i + 1).padStart(2, "0"))},true);\n`;
  });
  const profile = uid(600 + school);
  sql += `insert into teacher_profiles(id,school_id,teacher_id,display_name,designation,subjects,classes,approved_fields,visible,published_at)values(${q(profile)},${q(schoolId)},${q(teachers[0])},'Synthetic Computing Teacher','Teacher',array['Computing'],array['9B'],'{"biography":"Fictional demonstration profile"}',true,now());\n`;
  sql += `insert into teacher_profiles(school_id,teacher_id,display_name,visible)values(${q(schoolId)},${q(teachers[1])},'Draft Synthetic Teacher',false);\n`;
  const group = uid(610 + school);
  sql += `insert into groups(id,school_id,class_id,teacher_id,subject,title)values(${q(group)},${q(schoolId)},${q(classId)},${q(teachers[0])},'Computing','Synthetic 9B Computing');\n`;
  roster.slice(0, 3).forEach((student, i) => {
    sql += `insert into group_memberships values(${q(schoolId)},${q(group)},${q(student)},${q(["active", "pending", "removed"][i])},now());\n`;
  });
  for (const hours of [24, 168]) {
    const query = uid(650 + school * 10 + hours);
    sql += `insert into queries(id,school_id,student_id,teacher_id,class_id,subject,topic)values(${q(query)},${q(schoolId)},${q(roster[0])},${q(teachers[0])},${q(classId)},'Computing','Synthetic ${hours}-hour query');\ninsert into query_cycles(school_id,query_id,cycle,teacher_id,policy_hours,policy_revision,original_due_at,due_at)values(${q(schoolId)},${q(query)},1,${q(teachers[0])},${hours},1,now()+interval '${hours} hours',now()+interval '${hours} hours');\ninsert into query_messages(school_id,query_id,cycle,author_id,body,kind)values(${q(schoolId)},${q(query)},1,${q(roster[0])},'Synthetic private question','question');\n`;
  }
}
const paper = fixturePaper();
const v = uid(700);
sql += `insert into exam_versions(id,school_id,teacher_id,class_id,title,subject,instructions,opens_at,closes_at,duration_seconds,shuffle)values(${q(v)},${q(ids.school)},${q(ids.teacher)},${q(ids.class)},${q(paper.title)},'Computing','Synthetic mixed paper',now()-interval '1 hour',now()+interval '12 hours',1800,true);\n`;
paper.questions.forEach((question, i) => {
  sql += `insert into exam_questions values(${q(ids.school)},${q(v)},${q(question.id)},${i},${q(question.type)},${question.max},${q(JSON.stringify(question))}::jsonb);\ninsert into private.question_keys values(${q(ids.school)},${q(v)},${q(question.id)},${q(JSON.stringify(paper.keys[i]))}::jsonb);\n`;
});
for (const student of students[0])
  sql += `insert into exam_recipients values(${q(ids.school)},${q(v)},${q(student)},0,now()+interval '12 hours',false);\n`;
writeFileSync("supabase/seed.sql", sql);
writeFileSync(
  "tests/synthetic-paper.json",
  JSON.stringify(paper, null, 2) + "\n",
);
// Extend the fixture with completed/in-progress/unstarted attempts and three
// published assessments across two subjects. All accounts remain synthetic.
const script: string[] = [];
script.push(
  `insert into teacher_assignments values('${ids.school}','${ids.teacher}','${ids.class}','Mathematics');`,
);
script.push(`do $seed$ declare a jsonb;ver uuid;result_id uuid;p jsonb;question jsonb;begin
perform set_config('request.jwt.claim.sub','${ids.student}',true);
a:=public.start_attempt(jsonb_build_object('writer','${uid(999)}','versionId','${v}'));
perform public.save_answer(jsonb_build_object('attemptId',a->>'id','questionId','${paper.questions[0].id}','response','${paper.keys[0].correct}','revision',1,'writer',a->>'writer'));
perform public.submit_attempt(jsonb_build_object('attemptId',a->>'id','writer',a->>'writer'));
perform set_config('request.jwt.claim.sub','${ids.teacher}',true);
for question in select content from public.exam_questions where version_id='${v}' and type='subjective'loop perform public.review_grade(jsonb_build_object('attemptId',a->>'id','questionId',question->>'id','score',300,'revision',1,'feedback','Synthetic teacher feedback','reason','Synthetic fixture'));end loop;
result_id:=public.publish_result(jsonb_build_object('attemptId',a->>'id','reason','Synthetic result'));
-- Current mixed-format assessment remains current for in-progress/unstarted fixtures.
`);
for (let i = 0; i < 2; i++) {
  const p = {
    ...paper,
    subject: i ? "Mathematics" : "Computing",
    classId: ids.class,
    title: "Synthetic assessment " + (i + 2),
    opensAt: new Date(Date.now() - 60000).toISOString(),
    closesAt: new Date(Date.now() + 3600000).toISOString(),
  };
  script.push(
    `p:=${q(JSON.stringify(p))}::jsonb;p:=p||jsonb_build_object('opensAt',now()-interval '1 hour','closesAt',now()+interval '12 hours');ver:=public.publish_exam(p);perform set_config('request.jwt.claim.sub','${ids.student}',true);a:=public.start_attempt(jsonb_build_object('writer','${uid(999)}','versionId',ver));perform public.submit_attempt(jsonb_build_object('attemptId',a->>'id','writer',a->>'writer'));perform set_config('request.jwt.claim.sub','${ids.teacher}',true);for question in select content from public.exam_questions where version_id=ver and type='subjective'loop perform public.review_grade(jsonb_build_object('attemptId',a->>'id','questionId',question->>'id','score',${350 + i * 50},'revision',1,'feedback','Synthetic feedback','reason','Synthetic fixture'));end loop;result_id:=public.publish_result(jsonb_build_object('attemptId',a->>'id','reason','Synthetic result'));update public.results set published_at=now()-interval '${14 - i * 7} days'where id=result_id;update public.exam_versions set opens_at=now()-interval '${14 - i * 7} days'-interval '1 hour',closes_at=now()-interval '${14 - i * 7} days'where id=ver;update public.exam_recipients set closes_at=now()-interval '${14 - i * 7} days'where version_id=ver;update public.attempts set started_at=now()-interval '${14 - i * 7} days'-interval '30 minutes',deadline=now()-interval '${14 - i * 7} days',finalized_at=now()-interval '${14 - i * 7} days'-interval '10 minutes'where version_id=ver;`,
  );
}
script.push(
  `perform set_config('request.jwt.claim.sub','${ids.peer}',true);a:=public.start_attempt(jsonb_build_object('writer','${uid(999)}','versionId','${v}'));end $seed$;`,
);
script.push(
  `insert into posts(school_id,group_id,author_id,title,body)values('${ids.school}','${uid(610)}','${ids.teacher}','Synthetic announcement','Read this synthetic computing note. No public comments.');`,
);
script.push(
  `update queries set state='resolved'where id='${uid(674)}';update query_cycles set solution_delivered_at=now(),student_resolved_at=now()where query_id='${uid(674)}';`,
);
script.push(
  `insert into memberships(id,school_id,role,display_name,active)values('${uid(990)}','${ids.school}','teacher','Disabled Synthetic Teacher',false);insert into teacher_profiles(school_id,teacher_id,display_name,visible)values('${ids.school}','${uid(990)}','Disabled Synthetic Teacher',true);`,
);
script.push(
  `do $seed$ declare revision_id uuid;article_id uuid;begin perform set_config('request.jwt.claim.sub','${ids.teacher}',true);revision_id:=public.write_article(jsonb_build_object('profileId','${uid(600)}','title','Synthetic loop guide','summary','School-only synthetic article','subject','Computing','body','Read as plain text. Synthetic demonstration only.','state','submitted'));select ar.article_id into article_id from public.article_revisions ar where ar.id=revision_id;perform set_config('request.jwt.claim.sub','${ids.admin}',true);perform public.moderate_article(jsonb_build_object('articleId',article_id,'revisionId',revision_id,'action','publish','audience','school','reason','Synthetic review'));end $seed$;`,
);
writeFileSync("supabase/seed.sql", sql + script.join("\n") + "\n");

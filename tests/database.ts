import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
export const ids = {
  school: "10000000-0000-4000-8000-000000000001",
  otherSchool: "10000000-0000-4000-8000-000000000002",
  owner: "20000000-0000-4000-8000-000000000000",
  admin: "20000000-0000-4000-8000-000000000001",
  teacher: "20000000-0000-4000-8000-000000000002",
  student: "20000000-0000-4000-8000-000000000003",
  peer: "20000000-0000-4000-8000-000000000004",
  other: "20000000-0000-4000-8000-000000000005",
  class: "30000000-0000-4000-8000-000000000001",
};
export async function database(withFixtures = true) {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid()to authenticated,anon,service_role;`,
  );
  for (const f of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  if (!withFixtures) return db;
  await db.exec(`
insert into schools(id,code,name)values('${ids.school}','oak','Oak School'),('${ids.otherSchool}','pine','Pine School');
insert into subscriptions(school_id,plan,starts_at,ends_at,teacher_limit,student_limit,ai_limit)select id,'Test',now()-interval '1 day',now()+interval '1 year',10,100,100 from schools;
insert into memberships(id,school_id,role,display_name)values('${ids.owner}',null,'owner','Owner'),('${ids.admin}','${ids.school}','administrator','Admin'),('${ids.teacher}','${ids.school}','teacher','Teacher'),('${ids.student}','${ids.school}','student','Student'),('${ids.peer}','${ids.school}','student','Peer'),('${ids.other}','${ids.otherSchool}','student','Other');
insert into classes(id,school_id,academic_year,name,section)values('${ids.class}','${ids.school}','2026','9','B');
insert into teacher_assignments values('${ids.school}','${ids.teacher}','${ids.class}','Computing');
insert into student_registry(student_id,school_id)select id,school_id from memberships where role='student';
insert into enrollments values('${ids.school}','${ids.class}','${ids.student}','01',true),('${ids.school}','${ids.class}','${ids.peer}','02',true);
`);
  return db;
}
export async function asUser(
  db: PGlite,
  user: string,
  sql: string,
  params: unknown[] = [],
) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
export async function call<T = unknown>(
  db: PGlite,
  user: string,
  name: string,
  p: unknown,
): Promise<T> {
  const r = await asUser(db, user, `select public.${name}($1::jsonb) as data`, [
    JSON.stringify(
      name === "start_attempt" ? { writer: ids.student, ...(p as object) } : p,
    ),
  ]);
  return (r.rows[0] as { data: T }).data;
}

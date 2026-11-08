-- Read existing tagged acceptance fixtures only; all temporary identity/session
-- rows and state changes roll back. The real active owner is never modified.
begin;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
create temporary table report_probe as
select r.student_id as student_id,
 (select id from public.memberships where school_id=r.school_id and role='administrator'limit 1) as admin_id,
 (select teacher_id from public.exam_versions where id=r.version_id) as teacher_id,
 (select id from public.memberships where school_id='ff6d65e9-4ed1-4789-b770-1fa6c1e13af6' and role='student'limit 1)as foreign_id,
 r.school_id as school_id from public.results r where r.school_id='41c049c3-68b8-42c8-86ac-2e24822dec8f'limit 1;
do $$begin if(select count(*)from report_probe)<>1 then raise exception 'MISSING_TAGGED_REPORT_FIXTURE';end if;end$$;
update public.schools set status='active'where id in('41c049c3-68b8-42c8-86ac-2e24822dec8f','ff6d65e9-4ed1-4789-b770-1fa6c1e13af6');
update public.memberships set active=true where id in(select student_id from report_probe union select admin_id from report_probe union select teacher_id from report_probe union select foreign_id from report_probe);
create temporary table report_probe_sessions as select id,gen_random_uuid()as session_id from public.memberships where id in(select student_id from report_probe union select admin_id from report_probe union select teacher_id from report_probe union select foreign_id from report_probe);
insert into auth.users(id,aud,role,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)select id,'authenticated','authenticated',now(),now(),'{}','{}'from report_probe_sessions;
insert into auth.sessions(id,user_id,created_at,updated_at)select session_id,id,clock_timestamp(),clock_timestamp()from report_probe_sessions;
grant select on report_probe,report_probe_sessions to authenticated;
create temporary table deadline_probe as select a.id,a.writer,a.version_id,(select id from public.exam_questions where version_id=a.version_id order by position limit 1)as question_id from public.attempts a where a.student_id=(select student_id from report_probe)limit 1;
do $$begin if(select count(*)from deadline_probe)<>1 then raise exception 'MISSING_TAGGED_ATTEMPT';end if;end$$;
grant select on deadline_probe to authenticated;
update public.attempts set status='in_progress',deadline=clock_timestamp()+interval '5 minutes'where id=(select id from deadline_probe);
set local role authenticated;
select set_config('request.jwt.claim.sub',student_id::text,true),set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',student_id,'session_id',(select session_id from report_probe_sessions where id=student_id))::text,true)from report_probe;
do $$declare r jsonb;begin
 r:=public.save_answer(jsonb_build_object('attemptId',(select id from deadline_probe),'questionId',(select question_id from deadline_probe),'revision',99,'response',null));
 if r->>'error'is distinct from 'WRITER_CONFLICT'then raise exception 'FAIL_NATIVE_NULL_WRITER';end if;
 begin perform public.submit_attempt(jsonb_build_object('attemptId',(select id from deadline_probe)));raise exception 'FAIL_NATIVE_NULL_SUBMIT_WRITER';exception when raise_exception then if sqlerrm<>'WRITER_CONFLICT'then raise;end if;end;
end$$;
reset role;
update public.attempts set deadline=clock_timestamp()+interval '150 milliseconds'where id=(select id from deadline_probe);
select pg_sleep(0.25);
set local role authenticated;
do $$declare r jsonb;begin
 r:=public.save_answer(jsonb_build_object('attemptId',(select id from deadline_probe),'questionId',(select question_id from deadline_probe),'writer',(select writer from deadline_probe),'revision',99,'response',null));
 if r->>'error'is distinct from 'ATTEMPT_EXPIRED'then raise exception 'FAIL_NATIVE_DEADLINE_CLOCK';end if;
 r:=public.submit_attempt(jsonb_build_object('attemptId',(select id from deadline_probe),'writer',(select writer from deadline_probe)));
 if r->>'status'<>'expired'or r?'writer'then raise exception 'FAIL_NATIVE_FINAL_RECEIPT';end if;
end$$;
reset role;
select jsonb_build_object('nativeDeadlineClock',true,'nullWriterDenied',true,'closedWriterRedacted',true,'realOwnerUnchanged',(select count(*)=1 from public.memberships where role='owner'and active))as verification;
rollback;

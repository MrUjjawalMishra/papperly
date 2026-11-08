-- Run only against verified Papperly staging, inside a transaction containing
-- supabase/seed.sql. The caller must ROLLBACK. No credential or persistent Auth user is created.
-- Ephemeral provider-session rows for ordinary-role SQL verification only.
-- The enclosing transaction MUST roll back; these have no password credentials.
insert into auth.users(id,aud,role,email,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
select id,'authenticated','authenticated',id::text||'@sql-fixture.invalid',now(),now(),'{}','{}'
from public.memberships where school_id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002') or id='20000000-0000-4000-8000-000000000000'
on conflict(id) do nothing;
insert into auth.sessions(id,user_id,created_at,updated_at)
select id,id,now()-interval '1 hour',now() from public.memberships where school_id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002') or id='20000000-0000-4000-8000-000000000000'
on conflict(id) do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003"}',true);
do $checks$ begin
 if (select count(*)from public.results)<>3 then raise exception 'FAIL_STUDENT_PUBLISHED_RESULTS';end if;
 if (select count(*)from public.results where school_id='10000000-0000-4000-8000-000000000002')<>0 then raise exception 'FAIL_CROSS_SCHOOL_RESULTS';end if;
 if abs((public.student_progress('{}')->>'percentage')::numeric-100.0*2200/7500)>0.00001 then raise exception 'FAIL_WEIGHTED_PUBLISHED_METRICS';end if;
 begin perform 1 from private.question_keys;raise exception 'FAIL_KEYS_EXPOSED';exception when insufficient_privilege then null;end;
 begin perform public.runtime_dispatch('{}');raise exception 'FAIL_SERVICE_RPC_EXPOSED';exception when insufficient_privilege then null;end;
 begin update public.memberships set role='owner'where id=auth.uid();raise exception 'FAIL_ROLE_ESCALATION';exception when insufficient_privilege then null;end;
 begin perform writer from public.attempts;raise exception 'FAIL_WRITER_TOKEN_EXPOSED';exception when insufficient_privilege then null;end;
 begin perform public.write_post('{"groupId":"40000000-0000-4000-8000-000000000610","title":"Forbidden","body":"Student cannot post"}');raise exception 'FAIL_STUDENT_POSTING';exception when insufficient_privilege then null;end;
 if (select count(*)from public.posts)<>1 then raise exception 'FAIL_ACTIVE_GROUP_READ';end if;
 if jsonb_array_length(public.directory('{}'))<>1 then raise exception 'FAIL_APPROVED_DIRECTORY';end if;
 if (select count(*)from public.query_messages where school_id='10000000-0000-4000-8000-000000000002')<>0 then raise exception 'FAIL_PRIVATE_QUERY_TENANCY';end if;
end $checks$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000004","session_id":"20000000-0000-4000-8000-000000000004"}',true);
do $checks$ begin
 if (select count(*)from public.posts)<>0 then raise exception 'FAIL_PENDING_MEMBERSHIP';end if;
 if (select count(*)from public.query_messages)<>0 then raise exception 'FAIL_PEER_QUERY_PRIVACY';end if;
 begin perform public.student_progress('{}');raise exception 'FAIL_ACTIVE_ATTEMPT_SUPPORT';exception when insufficient_privilege then null;end;
end $checks$;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000520',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000520","session_id":"40000000-0000-4000-8000-000000000520"}',true);
do $checks$ begin
 if (select count(*)from public.results)<>0 then raise exception 'FAIL_OTHER_SCHOOL_RESULTS';end if;
 begin perform public.student_progress('{"studentId":"20000000-0000-4000-8000-000000000003"}');raise exception 'FAIL_OTHER_SCHOOL_REPORT';exception when insufficient_privilege then null;end;
end $checks$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001"}',true);
do $checks$ begin
 if (select count(*)from public.query_messages)<>0 then raise exception 'FAIL_ADMIN_PRIVATE_CONTENT';end if;
 if (select count(*)from public.queries)<>2 then raise exception 'FAIL_ADMIN_QUERY_METADATA';end if;
end $checks$;
reset role;
update public.group_memberships set state='removed'where group_id='40000000-0000-4000-8000-000000000610'and student_id='20000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003"}',true);
do $checks$ begin if (select count(*)from public.posts)<>0 then raise exception 'FAIL_REVOKED_GROUP_ACCESS';end if;end $checks$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $checks$ begin
 if jsonb_array_length(public.directory('{}'))<>0 then raise exception 'FAIL_ANONYMOUS_SCHOOL_PROFILE';end if;
 begin perform public.runtime_dispatch('{}');raise exception 'FAIL_ANONYMOUS_SERVICE_RPC';exception when insufficient_privilege then null;end;
end $checks$;
reset role;

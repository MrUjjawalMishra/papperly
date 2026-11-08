-- Run after seed.sql and rls-checks.sql in the SAME rollback-only transaction.
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.memberships set active=false where id='20000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000004","session_id":"20000000-0000-4000-8000-000000000004"}',true);
do $checks$ begin
 begin perform public.owner_usage('{}');raise exception 'FAIL_INACTIVE_OWNER_RPC';exception when insufficient_privilege then null;end;
 begin perform 1 from public.memberships;raise exception 'FAIL_INACTIVE_TABLE_READ';exception when insufficient_privilege then null;end;
end $checks$;
reset role;
update public.memberships set active=true where id='20000000-0000-4000-8000-000000000004';
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.runtime_credentials_revoke('{"userId":"20000000-0000-4000-8000-000000000004","actorId":"20000000-0000-4000-8000-000000000002","reason":"Synthetic SQL reset"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000004","session_id":"20000000-0000-4000-8000-000000000004"}',true);
do $checks$ begin
 begin perform 1 from public.memberships;raise exception 'FAIL_REVOKED_JWT_TABLE_READ';exception when insufficient_privilege then null;end;
 begin perform public.student_progress('{}');raise exception 'FAIL_REVOKED_JWT_RPC';exception when insufficient_privilege then null;end;
end $checks$;
reset role;
insert into auth.sessions(id,user_id,created_at,updated_at)values('a0000000-0000-4000-8000-000000000094','20000000-0000-4000-8000-000000000004',clock_timestamp(),clock_timestamp());
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000004","session_id":"a0000000-0000-4000-8000-000000000094"}',true);
do $checks$ begin
 if (select count(*) from public.memberships where id=auth.uid())<>1 then raise exception 'FAIL_FRESH_AUTH_SESSION';end if;
end $checks$;
reset role;
update auth.sessions set not_after=now()-interval '1 second' where id='a0000000-0000-4000-8000-000000000094';
set local role authenticated;
do $checks$ begin
 begin perform 1 from public.memberships;raise exception 'FAIL_EXPIRED_AUTH_SESSION';exception when insufficient_privilege then null;end;
end $checks$;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000095',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"a0000000-0000-4000-8000-000000000095","session_id":"a0000000-0000-4000-8000-000000000094"}',true);
do $checks$ begin
 begin perform public.owner_usage('{}');raise exception 'FAIL_UNPROVISIONED_OWNER_RPC';exception when insufficient_privilege then null;end;
end $checks$;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $checks$ begin
 begin perform public.owner_usage('{}');raise exception 'FAIL_MISSING_IDENTITY_OWNER_RPC';exception when insufficient_privilege then null;end;
end $checks$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);

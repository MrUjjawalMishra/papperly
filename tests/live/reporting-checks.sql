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
set local role authenticated;
select set_config('request.jwt.claim.sub',admin_id::text,true),set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id,'session_id',(select session_id from report_probe_sessions where id=admin_id))::text,true)from report_probe;
do $$declare r jsonb;e uuid;begin
 r:=public.student_progress(jsonb_build_object('studentId',(select student_id from report_probe)));
 if (r->>'count')::int<>1 or jsonb_array_length(r->'enrollmentHistory')=0 then raise exception 'FAIL_NATIVE_LONGITUDINAL_REPORT';end if;
 if jsonb_path_exists(r,'$.queryMetadata[*].body')or jsonb_path_exists(r,'$.supportNotes')then raise exception 'FAIL_NATIVE_REPORT_PRIVACY';end if;
 e:=public.request_export(jsonb_build_object('studentId',(select student_id from report_probe),'format','printable'));
 if e is null then raise exception 'FAIL_NATIVE_EXPORT_REQUEST';end if;
end$$;
select set_config('request.jwt.claim.sub',foreign_id::text,true),set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',foreign_id,'session_id',(select session_id from report_probe_sessions where id=foreign_id))::text,true)from report_probe;
do $$begin
 begin perform public.student_progress(jsonb_build_object('studentId',(select student_id from report_probe)));raise exception 'FAIL_NATIVE_FOREIGN_REPORT';exception when insufficient_privilege then null;end;
end$$;
reset role;
select jsonb_build_object('nativeLongitudinalReport',true,'queryMetadataPrivacy',true,'printableExportReservation',true,'crossSchoolDenial',true,'realOwnerUnchanged',(select count(*)=1 from public.memberships where role='owner'and active))as verification;
rollback;

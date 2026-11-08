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
select set_config('request.jwt.claim.sub',student_id::text,true),set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',student_id,'session_id',(select session_id from report_probe_sessions where id=student_id))::text,true)from report_probe;
do $$begin begin perform private.insight_evidence((select student_id from report_probe),(select school_id from report_probe));raise exception 'FAIL_NATIVE_PRIVATE_EVIDENCE';exception when insufficient_privilege then null;end;end$$;
reset role;
select private.bump_insight(student_id,school_id)from report_probe;
create temporary table insight_probe as select public.runtime_claim(jsonb_build_object('id',o.id))as job from public.outbox o join public.student_insights i on i.student_id=(o.payload->>'studentId')::uuid where o.kind='insight'and o.payload->>'studentId'=(select student_id::text from report_probe)and(o.payload->>'sourceVersion')::bigint=i.source_version limit 1;
do $$declare j jsonb;begin select job into j from insight_probe;
 if j is null or jsonb_array_length(j->'data'->'results')=0 or j->'data'->>'fingerprint'is null then raise exception 'FAIL_NATIVE_EVIDENCE';end if;
 if jsonb_path_exists(j->'data','$.results[*].studentId')or jsonb_path_exists(j->'data','$.results[*].rubric')then raise exception 'FAIL_NATIVE_EVIDENCE_PRIVACY';end if;
end$$;
-- A fresh source version invalidates an already claimed result independently of
-- provider timing. No generated content is retained after this transaction.
select private.bump_insight(student_id,school_id)from report_probe;
select public.runtime_finish(jsonb_build_object('id',job->>'id','runToken',job->>'runToken','status','done','sourceVersion',job->'data'->'sourceVersion','evidenceFingerprint',job->'data'->>'fingerprint','result',jsonb_build_object('syntheticStale',true)))from insight_probe;
do $$begin if exists(select 1 from public.student_insights where student_id=(select student_id from report_probe)and content is not null)then raise exception 'FAIL_NATIVE_STALE_GUIDANCE';end if;end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',teacher_id::text,true),set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',teacher_id,'session_id',(select session_id from report_probe_sessions where id=teacher_id))::text,true)from report_probe;
do $$declare c uuid;sub text;g uuid;po uuid;p jsonb;a jsonb;b jsonb;begin
 select class_id,subject into c,sub from public.teacher_assignments where teacher_id=(select teacher_id from report_probe)limit 1;
 g:=public.create_group(jsonb_build_object('classId',c,'subject',sub,'title','Synthetic rollback upload'));
 po:=public.write_post(jsonb_build_object('groupId',g,'title','Synthetic document','body','No file bytes are uploaded'));
 p:=jsonb_build_object('postId',po,'filename','synthetic.pdf','type','application/pdf','size',100,'checksum',repeat('a',64),'idempotencyKey','native-rollback-upload');
 a:=public.reserve_upload(p);b:=public.reserve_upload(p);
 if a->>'id'is distinct from b->>'id'then raise exception 'FAIL_NATIVE_UPLOAD_DEDUP';end if;
 begin perform public.reserve_upload(p||jsonb_build_object('checksum',repeat('b',64)));raise exception 'FAIL_NATIVE_UPLOAD_CONFLICT';exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT'then raise;end if;end;
end$$;
reset role;
select jsonb_build_object('nativeEvidencePrivacy',true,'privateEvidenceDenied',true,'staleGuidanceDenied',true,'uploadDeduplicated',true,'uploadConflictDenied',true,'realOwnerUnchanged',(select count(*)=1 from public.memberships where role='owner'and active))as verification;
rollback;

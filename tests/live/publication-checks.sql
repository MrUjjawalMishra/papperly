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
update public.subscriptions set starts_at=clock_timestamp()-interval '1 day',ends_at=clock_timestamp()+interval '1 day'where school_id=(select school_id from report_probe);
create temporary table publication_probe(profile_id uuid,profile_revision uuid,article_id uuid,article_revision uuid,attachment_id uuid,asset_id uuid);
grant all on publication_probe to authenticated;grant select on publication_probe to anon;
set local role authenticated;
select set_config('request.jwt.claim.sub',admin_id::text,true),set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id,'session_id',(select session_id from report_probe_sessions where id=admin_id))::text,true)from report_probe;
do $$declare pr uuid;begin
 select id into pr from public.teacher_profiles where teacher_id=(select teacher_id from report_probe);
 if pr is null then pr:=public.manage_profile(jsonb_build_object('action','create','teacherId',(select teacher_id from report_probe),'displayName','Synthetic rollback teacher','reason','Native publication probe'));end if;
 insert into publication_probe(profile_id)values(pr);
 perform public.set_public_policy(jsonb_build_object('enabled',true,'indexingEnabled',false,'reason','Synthetic rollback publication'));
end$$;
select set_config('request.jwt.claim.sub',teacher_id::text,true),set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',teacher_id,'session_id',(select session_id from report_probe_sessions where id=teacher_id))::text,true)from report_probe;
do $$declare r uuid;a uuid;v uuid;f jsonb;begin
 r:=public.manage_profile(jsonb_build_object('action','draft','profileId',(select profile_id from publication_probe),'content',jsonb_build_object('biography','Synthetic approved biography'),'reason','Native probe'));
 v:=public.write_article(jsonb_build_object('profileId',(select profile_id from publication_probe),'title','Synthetic rollback lesson','summary','No real data','subject','Computing','body','Synthetic approved content','state','submitted'));
 select article_id into a from public.article_revisions where id=v;
 f:=public.reserve_upload(jsonb_build_object('articleRevisionId',v,'filename','synthetic.pdf','type','application/pdf','size',100,'checksum',repeat('a',64),'idempotencyKey','native-publication-upload'));
 update publication_probe set profile_revision=r,article_id=a,article_revision=v,attachment_id=(f->>'id')::uuid;
end$$;
select set_config('request.jwt.claim.sub',admin_id::text,true),set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id,'session_id',(select session_id from report_probe_sessions where id=admin_id))::text,true)from report_probe;
do $$begin
 perform public.manage_profile(jsonb_build_object('action','approve','profileId',(select profile_id from publication_probe),'revisionId',(select profile_revision from publication_probe),'audience','school','reason','Synthetic approval'));
 begin perform public.moderate_article(jsonb_build_object('articleId',(select article_id from publication_probe),'revisionId',(select article_revision from publication_probe),'action','publish','audience','public','assetIds',jsonb_build_array((select attachment_id from publication_probe)),'reason','Synthetic scan boundary'));raise exception 'FAIL_NATIVE_UNSCANNED_PUBLICATION';exception when raise_exception then if sqlerrm<>'ASSET_NOT_CLEAN_OR_INDEPENDENT'then raise;end if;end;
end$$;
reset role;
-- Synthetic database fixture only: no R2 object is uploaded and no live malware
-- scanning or storage-copy integration is claimed by this rollback-only probe.
update public.attachments set state='clean'where id=(select attachment_id from publication_probe);
set local role authenticated;
do $$begin perform public.moderate_article(jsonb_build_object('articleId',(select article_id from publication_probe),'revisionId',(select article_revision from publication_probe),'action','publish','audience','public','assetIds',jsonb_build_array((select attachment_id from publication_probe)),'reason','Synthetic database fixture approval'));end$$;
reset role;
update publication_probe set asset_id=(select pa.id from public.public_assets pa join public.content_publications cp on cp.id=pa.publication_id where cp.article_id=(select article_id from publication_probe)and pa.revoked_at is null);
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
set local role anon;
do $$declare r jsonb;begin r:=public.article_detail(jsonb_build_object('articleId',(select article_id from publication_probe)));if r->>'title'<>'Synthetic rollback lesson'or(r->>'indexingEnabled')::boolean then raise exception 'FAIL_NATIVE_PUBLIC_ARTICLE';end if;
 begin perform public.publication_asset(jsonb_build_object('id',(select asset_id from publication_probe)));raise exception 'FAIL_NATIVE_PENDING_ASSET';exception when insufficient_privilege then null;end;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',admin_id::text,true),set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id,'session_id',(select session_id from report_probe_sessions where id=admin_id))::text,true)from report_probe;
do $$begin perform public.moderate_article(jsonb_build_object('articleId',(select article_id from publication_probe),'revisionId',(select article_revision from publication_probe),'action','publish','audience','school','reason','Synthetic audience change'));end$$;
select set_config('request.jwt.claim.sub',foreign_id::text,true),set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',foreign_id,'session_id',(select session_id from report_probe_sessions where id=foreign_id))::text,true)from report_probe;
do $$begin begin perform public.article_detail(jsonb_build_object('articleId',(select article_id from publication_probe)));raise exception 'FAIL_NATIVE_FOREIGN_ARTICLE';exception when insufficient_privilege then null;end;end$$;
reset role;
select jsonb_build_object('databasePublicationPermissions',true,'unscannedPublicationDenied',true,'pendingAssetDenied',true,'explicitPublicRead',true,'audienceChangeDeniedForeign',true,'realOwnerUnchanged',(select count(*)=1 from public.memberships where role='owner'and active),'r2CopyOrLiveScanningVerified',false)as verification;
rollback;

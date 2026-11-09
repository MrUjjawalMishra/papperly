-- Publication uploads are independent contexts, never a copied private group URL.
alter table public.attachments add column article_revision_id uuid references public.article_revisions(id),add column profile_id uuid references public.teacher_profiles(id);
alter table public.attachments drop constraint attachments_check;
alter table public.attachments add constraint attachment_single_parent check(num_nonnulls(post_id,query_message_id,article_revision_id,profile_id)=1);
alter table public.public_assets add column attachment_id uuid references public.attachments(id),add column checksum text,add column size bigint,add column filename text,add column declared_type text,add column state text not null default 'pending'check(state in('pending','ready','revoked')),add column charged boolean not null default false;
update private.upload_requests set request=jsonb_build_object('articleRevisionId',null,'profileId',null)||request;
create index publication_asset_source on public.public_assets(attachment_id);
alter table public.teacher_profiles add column contact_info jsonb not null default '{}',add column approved_revision uuid references public.profile_revisions(id);

create function private.reserve_publication_assets(pub uuid,aid uuid,pid uuid,ids jsonb)returns void language plpgsql security definer set search_path='' as $$declare cp public.content_publications;a public.attachments;asset uuid;v text;cap bigint;used bigint;begin
 select * into cp from public.content_publications where id=pub and revoked_at is null;
 if cp.id is null or jsonb_typeof(ids)is distinct from 'array'or jsonb_array_length(ids)>(case when pid is not null then 1 else 5 end) or(select count(distinct x)from jsonb_array_elements_text(ids)x)<>jsonb_array_length(ids)then raise exception 'INVALID_ASSETS';end if;
 select storage_limit into cap from public.subscriptions where school_id=cp.school_id for update;
 select coalesce((select sum(size)from public.attachments where school_id=cp.school_id and charged and state<>'deleted'),0)+coalesce((select sum(size)from public.public_assets where school_id=cp.school_id and charged),0)into used;
 for v in select jsonb_array_elements_text(ids)loop
 select at.*into a from public.attachments at left join public.article_revisions r on r.id=at.article_revision_id where at.id=v::uuid and at.school_id=cp.school_id and at.state='clean'and((aid is not null and r.article_id=aid)or(pid is not null and at.profile_id=pid));
 if not found or pid is not null and a.declared_type not in('image/png','image/jpeg')then raise exception 'ASSET_NOT_CLEAN_OR_INDEPENDENT';end if;
 if used+a.size>cap then raise exception 'STORAGE_QUOTA_EXCEEDED';end if;used:=used+a.size;asset:=gen_random_uuid();
 insert into public.public_assets(id,school_id,publication_id,object_key,approved,attachment_id,checksum,size,filename,declared_type,charged)values(asset,cp.school_id,pub,cp.school_id||'/publications/'||pub||'/'||asset,true,a.id,a.checksum,a.size,a.filename,a.declared_type,true);
 insert into public.outbox(school_id,kind,dedup_key,payload)values(cp.school_id,'asset_copy','asset-copy:'||asset,jsonb_build_object('assetId',asset));
 end loop;
end$$;
revoke execute on function private.reserve_publication_assets(uuid,uuid,uuid,jsonb)from public,anon,authenticated;

create function private.revoke_asset_job()returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.revoked_at is null and new.revoked_at is not null then
 new.state:='revoked';insert into public.outbox(school_id,kind,dedup_key,payload)values(new.school_id,'asset_cleanup','asset-cleanup:'||new.id,jsonb_build_object('assetId',new.id))on conflict do nothing;
 end if;return new;
end$$;
revoke execute on function private.revoke_asset_job()from public,anon,authenticated;
create trigger asset_revocation_work before update of revoked_at on public.public_assets for each row execute function private.revoke_asset_job();

create function public.runtime_asset_plan(p jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$declare j public.outbox;a public.public_assets;src public.attachments;cp public.content_publications;begin
 select *into j from public.outbox where id=(p->>'jobId')::uuid and run_token=(p->>'runToken')::uuid and status='processing'and kind in('asset_copy','asset_cleanup');
 if not found then return null;end if;
 select *into a from public.public_assets where id=(j.payload->>'assetId')::uuid and school_id=j.school_id;
 if not found then return null;end if;
 if j.kind='asset_cleanup'then if a.revoked_at is null then return null;end if;return jsonb_build_object('id',a.id,'objectKey',a.object_key);end if;
 select *into cp from public.content_publications where id=a.publication_id and revoked_at is null;
 select *into src from public.attachments where id=a.attachment_id and school_id=a.school_id and state='clean';
 if cp.id is null or a.revoked_at is not null or not a.approved or src.id is null then return null;end if;
 return jsonb_build_object('id',a.id,'objectKey',a.object_key,'sourceKey',src.object_key,'checksum',a.checksum,'size',a.size,'filename',a.filename,'type',a.declared_type);
end$$;
create function public.runtime_asset_finish(p jsonb)returns boolean language plpgsql security definer set search_path='' as $$declare j public.outbox;a public.public_assets;begin
 select *into j from public.outbox where id=(p->>'jobId')::uuid and run_token=(p->>'runToken')::uuid and status='processing'and kind in('asset_copy','asset_cleanup')for update;
 if not found then return false;end if;
 select *into a from public.public_assets where id=(j.payload->>'assetId')::uuid and school_id=j.school_id for update;
 if not found then return false;end if;
 if j.kind='asset_cleanup'then
 if a.revoked_at is null then return false;end if;update public.public_assets set charged=false,state='revoked'where id=a.id;
 else
 if a.revoked_at is not null or not a.approved or not exists(select 1 from public.content_publications where id=a.publication_id and revoked_at is null)or not exists(select 1 from public.attachments where id=a.attachment_id and state='clean'and checksum=a.checksum)then return false;end if;
 update public.public_assets set state='ready'where id=a.id;
 end if;return true;
end$$;
revoke execute on function public.runtime_asset_plan(jsonb),public.runtime_asset_finish(jsonb)from public,anon,authenticated;
grant execute on function public.runtime_asset_plan(jsonb),public.runtime_asset_finish(jsonb)to service_role;

create function public.publication_asset(p jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$declare a public.public_assets;cp public.content_publications;begin
 select *into a from public.public_assets where id=(p->>'id')::uuid and approved and state='ready'and revoked_at is null;
 select *into cp from public.content_publications where id=a.publication_id and revoked_at is null;
 if a.id is null or cp.id is null or not exists(select 1 from public.attachments where id=a.attachment_id and state='clean')or not((cp.article_id is not null and private.article_visible(cp.article_id))or(cp.profile_id is not null and private.profile_visible(cp.profile_id)))then raise exception 'ASSET_UNAVAILABLE'using errcode='42501';end if;
 return jsonb_build_object('objectKey',a.object_key,'filename',a.filename,'type',a.declared_type);
end$$;
revoke execute on function public.publication_asset(jsonb)from public,anon,authenticated;
grant execute on function public.publication_asset(jsonb)to anon,authenticated;

-- Draft uploads remain visible only to their author/school, even after scanning.
drop policy read_scope on public.attachments;
create policy read_scope on public.attachments for select to authenticated using(state='clean'and(
 post_id is not null and exists(select 1 from public.posts p where p.id=post_id)or query_message_id is not null and exists(select 1 from public.query_messages m where m.id=query_message_id)
 or school_id=private.school()and(private.role()='administrator'or private.role()='teacher'and uploader_id=auth.uid())and(article_revision_id is not null or profile_id is not null)));

create or replace function public.reserve_upload(p jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare s uuid:=private.school();pid uuid:=(p->>'postId')::uuid;mid uuid:=(p->>'messageId')::uuid;rid uuid:=(p->>'articleRevisionId')::uuid;pro uuid:=(p->>'profileId')::uuid;cap bigint;used bigint;n int;a public.attachments;k text;expected jsonb;prior private.upload_requests;begin perform private.require_access(s,true);perform private.learning_access();if num_nonnulls(pid,mid,rid,pro)<>1 then raise exception 'INVALID_PARENT';end if;if pid is not null and not exists(select 1 from public.posts where id=pid and private.group_teacher(group_id)and not deleted)then raise exception 'FORBIDDEN'using errcode='42501';end if;if mid is not null and not exists(select 1 from public.query_messages where id=mid and author_id=auth.uid()and private.can_query(query_id))then raise exception 'FORBIDDEN'using errcode='42501';end if;if rid is not null and not exists(select 1 from public.article_revisions r join public.teacher_articles ta on ta.id=r.article_id where r.id=rid and r.school_id=s and r.state in('draft','submitted')and(private.role()='administrator'or private.role()='teacher'and ta.author_id=auth.uid()))then raise exception 'FORBIDDEN'using errcode='42501';end if;
 if pro is not null and(not exists(select 1 from public.teacher_profiles where id=pro and school_id=s and(private.role()='administrator'or private.role()='teacher'and teacher_id=auth.uid()))or p->>'type'not in('image/png','image/jpeg'))then raise exception 'FORBIDDEN'using errcode='42501';end if;
 select storage_limit into cap from public.subscriptions where school_id=s for update;expected:=jsonb_build_object('postId',pid,'messageId',mid,'articleRevisionId',rid,'profileId',pro,'filename',p->>'filename','type',p->>'type','size',(p->>'size')::bigint,'checksum',p->>'checksum');
 k:=coalesce(p->>'idempotencyKey','auto:'||md5((case when rid is null and pro is null then expected-'articleRevisionId'-'profileId'else expected end)::text));
 if k!~'^[A-Za-z0-9._:-]{8,128}$'then raise exception 'INVALID_IDEMPOTENCY_KEY';end if;
 select * into prior from private.upload_requests where school_id=s and uploader_id=auth.uid()and request_key=k;
 if found then
 if prior.request is distinct from expected then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 select * into a from public.attachments where id=prior.attachment_id and school_id=s;
 if not found or a.state='deleted'then raise exception 'UPLOAD_RETIRED';end if;
 return jsonb_build_object('id',a.id,'objectKey',a.object_key,'state',a.state,'requiresUpload',a.state='quarantined'and not exists(select 1 from public.outbox where kind='scan'and payload->>'attachmentId'=a.id::text));
 end if;
 select coalesce((select sum(size)from public.attachments where school_id=s and charged and state<>'deleted'),0)+coalesce((select sum(size)from public.public_assets where school_id=s and charged),0)into used;if used+(p->>'size')::bigint>cap then raise exception 'STORAGE_QUOTA_EXCEEDED';end if;select count(*)into n from public.attachments where(post_id=pid or query_message_id=mid or article_revision_id=rid or profile_id=pro)and state<>'deleted';if n>=5 then raise exception 'MAXIMUM_FIVE_FILES';end if;insert into public.attachments(school_id,uploader_id,post_id,query_message_id,article_revision_id,profile_id,object_key,filename,declared_type,detected_type,size,checksum,charged)values(s,auth.uid(),pid,mid,rid,pro,s||'/'||gen_random_uuid(),p->>'filename',p->>'type',p->>'type',(p->>'size')::bigint,p->>'checksum',true)returning * into a;insert into private.upload_requests(school_id,uploader_id,request_key,attachment_id,request)values(s,auth.uid(),k,a.id,expected);perform private.audit(s,'file.reserved',a.id);return jsonb_build_object('id',a.id,'objectKey',a.object_key,'state',a.state,'requiresUpload',true);end$$;

create or replace function public.moderate_article(p jsonb)returns void language plpgsql security definer set search_path='' as $$
declare s uuid:=private.school();actor text:=private.role();a public.teacher_articles;r public.article_revisions;aud text:=p->>'audience';pub uuid;begin
 perform private.require_access(s,p->>'action'='publish');select * into a from public.teacher_articles where id=(p->>'articleId')::uuid and school_id=s for update;
 if a.id is null or length(trim(coalesce(p->>'reason','')))=0 or not(actor='administrator'or actor='teacher'and a.author_id=auth.uid())then raise exception 'FORBIDDEN'using errcode='42501';end if;
 if p?'revision'and a.revision is distinct from(p->>'revision')::int then raise exception 'STALE_REVISION';end if;
 if p->>'action'='publish'then
 if aud is null or aud not in('school','public')then raise exception 'INVALID_AUDIENCE';end if;
 if actor<>'administrator'and not exists(select 1 from public.publisher_grants where school_id=s and teacher_id=auth.uid()and audience=aud and revoked_at is null and(expires_at is null or expires_at>clock_timestamp()))then raise exception 'FORBIDDEN'using errcode='42501';end if;
 if aud='public'and not exists(select 1 from public.schools where id=s and public_enabled)then raise exception 'PUBLIC_NOT_ENABLED';end if;
 if a.published_revision=(p->>'revisionId')::uuid and a.audience=aud and not a.archived then
 if array(select x from jsonb_array_elements_text(coalesce(p->'assetIds','[]'))x order by x)is distinct from array(select pa.attachment_id::text from public.public_assets pa join public.content_publications cp on cp.id=pa.publication_id where cp.article_id=a.id and cp.revoked_at is null and pa.revoked_at is null order by pa.attachment_id::text)then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 return;end if;
 select * into r from public.article_revisions where id=(p->>'revisionId')::uuid and article_id=a.id and state in('submitted','approved');
 if r.id is null then raise exception 'INVALID_REVISION';end if;
 -- Reapproval/audience changes retire every prior publication and asset first.
 update public.content_publications set revoked_at=clock_timestamp(),cache_version=cache_version+1 where article_id=a.id and revoked_at is null;
 update public.public_assets set revoked_at=clock_timestamp()where publication_id in(select id from public.content_publications where article_id=a.id)and revoked_at is null;
 update public.article_revisions set state='approved'where id=r.id;
 update public.teacher_articles set published_revision=r.id,audience=aud,published_at=clock_timestamp(),archived=false,archived_author=not exists(select 1 from public.memberships where id=a.author_id and active),revision=revision+1 where id=a.id;
 insert into public.content_publications(school_id,article_id,audience)values(s,a.id,aud)returning id into pub;perform private.reserve_publication_assets(pub,a.id,null,coalesce(p->'assetIds','[]'));
 elsif p->>'action'in('unpublish','archive')then
 update public.teacher_articles set published_revision=null,published_at=null,archived=p->>'action'='archive',revision=revision+1 where id=a.id;
 update public.content_publications set revoked_at=clock_timestamp(),cache_version=cache_version+1 where article_id=a.id and revoked_at is null;
 update public.public_assets set revoked_at=clock_timestamp()where publication_id in(select id from public.content_publications where article_id=a.id)and revoked_at is null;
 elsif p->>'action'='changes_requested'and actor='administrator'then
 update public.article_revisions set state='changes_requested'where id=(p->>'revisionId')::uuid and article_id=a.id and state in('draft','submitted');
 if not found then raise exception 'INVALID_REVISION';end if;
 else raise exception 'INVALID_ACTION';end if;
 perform private.audit(s,'article.'||(p->>'action'),a.id,p->>'reason',jsonb_build_object('audience',aud,'revisionId',p->>'revisionId'));
end$$;

create or replace function public.article_detail(p jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$declare a public.teacher_articles;r public.article_revisions;pr public.teacher_profiles;begin
 select * into a from public.teacher_articles where id=(p->>'articleId')::uuid;
 if not private.article_visible(a.id)then raise exception 'ARTICLE_UNAVAILABLE'using errcode='42501';end if;
 select * into r from public.article_revisions where id=a.published_revision;select * into pr from public.teacher_profiles where id=a.profile_id;
 return jsonb_build_object('id',a.id,'revisionId',r.id,'title',r.title,'summary',r.summary,'subject',r.subject,'body',r.body,'author',jsonb_build_object('displayName',pr.display_name,'archived',a.archived_author,'profileId',case when private.profile_visible(pr.id)then pr.id end),'audience',a.audience,'publishedAt',a.published_at,'indexingEnabled',(select public_enabled and indexing_enabled from public.schools where id=a.school_id),'assets',coalesce((select jsonb_agg(jsonb_build_object('id',pa.id,'filename',pa.filename,'type',pa.declared_type)order by pa.id)from public.public_assets pa join public.content_publications cp on cp.id=pa.publication_id where cp.article_id=a.id and cp.revoked_at is null and pa.revoked_at is null and pa.approved and pa.state='ready'),'[]'));
end$$;

-- Recheck recent revocations after Queue cleanup as well: a timed-out copier can
-- finish its R2 write after a revocation. Authorization remains revoked throughout.
alter table public.public_assets add column cleanup_checked_at timestamptz;
create function public.runtime_asset_cleanup_candidates(p jsonb)returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(x),'[]')from(select id,object_key as "objectKey"from public.public_assets where revoked_at is not null and(charged or revoked_at>clock_timestamp()-interval '24 hours')order by cleanup_checked_at asc nulls first,id limit 20)x$$;
create function public.runtime_asset_cleanup_done(p jsonb)returns void language sql security definer set search_path='' as $$update public.public_assets set charged=false,state='revoked',cleanup_checked_at=clock_timestamp()where revoked_at is not null and id in(select value::uuid from jsonb_array_elements_text(p->'ids'))$$;
revoke execute on function public.runtime_asset_cleanup_candidates(jsonb),public.runtime_asset_cleanup_done(jsonb)from public,anon,authenticated;
grant execute on function public.runtime_asset_cleanup_candidates(jsonb),public.runtime_asset_cleanup_done(jsonb)to service_role;

create or replace function public.manage_profile(p jsonb)returns uuid language plpgsql security definer set search_path='' as $$declare s uuid:=private.school();pr public.teacher_profiles;rid uuid;pub uuid;begin perform private.require_access(s,p->>'action'in('create','draft','approve'));if p->>'action'='create' then if private.role()<>'administrator'or not exists(select 1 from public.memberships where id=(p->>'teacherId')::uuid and school_id=s and role='teacher'and active)then raise exception 'FORBIDDEN'using errcode='42501';end if;insert into public.teacher_profiles(school_id,teacher_id,display_name,designation,subjects,classes)values(s,(p->>'teacherId')::uuid,p->>'displayName',coalesce(p->>'designation',''),array(select jsonb_array_elements_text(p->'subjects')),array(select jsonb_array_elements_text(p->'classes')))returning id into rid;else select * into pr from public.teacher_profiles where id=(p->>'profileId')::uuid and school_id=s for update;if not found then raise exception 'FORBIDDEN'using errcode='42501';end if;
if p->>'action'='draft' then
 if jsonb_typeof(p->'content')is distinct from 'object'or jsonb_typeof(p->'content'->'biography')is distinct from 'string'or exists(select 1 from jsonb_object_keys(p->'content')k where k not in('biography','teachingApproach','qualifications','experience'))or exists(select 1 from jsonb_each(p->'content')v where jsonb_typeof(v.value)is distinct from 'string'or length(v.value#>>'{}')>20000)then raise exception 'INVALID_PROFILE';end if;
 if private.role()<>'teacher'or pr.teacher_id<>auth.uid()then raise exception 'FORBIDDEN'using errcode='42501';end if;insert into public.profile_revisions(school_id,profile_id,author_id,content,state)values(s,pr.id,auth.uid(),p->'content','submitted')returning id into rid;
elsif private.role()='administrator' then if p->>'action'='approve' then if p->>'audience'='public'and not exists(select 1 from public.schools where id=s and public_enabled)then raise exception 'PUBLIC_NOT_ENABLED';end if;if not exists(select 1 from public.profile_revisions where id=(p->>'revisionId')::uuid and profile_id=pr.id and state in('submitted','approved'))then raise exception 'INVALID_REVISION';end if;
 if pr.approved_revision=(p->>'revisionId')::uuid and pr.visible and pr.audience=p->>'audience'and (p->>'photoAttachmentId')::uuid is not distinct from(select pa.attachment_id from public.public_assets pa join public.content_publications cp on cp.id=pa.publication_id where cp.profile_id=pr.id and cp.revoked_at is null and pa.revoked_at is null limit 1)then return pr.id;end if;
 update public.teacher_profiles set approved_revision=(p->>'revisionId')::uuid,approved_fields=approved_fields||(select jsonb_strip_nulls(jsonb_build_object('biography',content->'biography','teachingApproach',content->'teachingApproach'))from public.profile_revisions where id=(p->>'revisionId')::uuid and profile_id=pr.id and state in('submitted','approved')),visible=true,audience=p->>'audience',published_at=now(),revision=revision+1 where id=pr.id;update public.profile_revisions set state='approved'where id=(p->>'revisionId')::uuid and profile_id=pr.id;update public.content_publications set revoked_at=clock_timestamp(),cache_version=cache_version+1 where profile_id=pr.id and revoked_at is null;
 update public.public_assets set revoked_at=clock_timestamp()where publication_id in(select id from public.content_publications where profile_id=pr.id)and revoked_at is null;
 insert into public.content_publications(school_id,profile_id,audience)values(s,pr.id,p->>'audience')returning id into pub;
 perform private.reserve_publication_assets(pub,null,pr.id,case when p->>'photoAttachmentId'is null then '[]'::jsonb else jsonb_build_array(p->>'photoAttachmentId')end);elsif p->>'action'='unpublish' then update public.teacher_profiles set visible=false,revision=revision+1 where id=pr.id;
 update public.content_publications set revoked_at=clock_timestamp(),cache_version=cache_version+1 where profile_id=pr.id and revoked_at is null;
 update public.public_assets set revoked_at=clock_timestamp()where publication_id in(select id from public.content_publications where profile_id=pr.id)and revoked_at is null;else raise exception 'INVALID_ACTION';end if;rid:=pr.id;else raise exception 'FORBIDDEN'using errcode='42501';end if;end if;perform private.audit(s,'profile.changed',rid,p->>'reason');return rid;end$$;

create or replace function public.update_profile_details(p jsonb)returns void language plpgsql security definer set search_path='' as $$
declare s uuid:=private.school();pr public.teacher_profiles;begin
 perform private.require_access(s,true);
 if private.role()<>'administrator'or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'FORBIDDEN'using errcode='42501';end if;
 select * into pr from public.teacher_profiles where id=(p->>'profileId')::uuid and school_id=s for update;
 if not found then raise exception 'FORBIDDEN'using errcode='42501';end if;
 if pr.revision is distinct from(p->>'revision')::int then raise exception 'STALE_REVISION';end if;
 if p?'contact'and(jsonb_typeof(p->'contact')is distinct from 'object'or coalesce(p->'contact'->>'kind','')not in('email','url','office')or length(coalesce(p->'contact'->>'value',''))not between 1 and 200)then raise exception 'INVALID_CONTACT';end if;
 update public.teacher_profiles set contact_info=case when p?'contact'then jsonb_build_object('kind',p->'contact'->>'kind','value',p->'contact'->>'value')else contact_info end,display_name=p->>'displayName',designation=p->>'designation',approved_fields=approved_fields||jsonb_build_object('qualifications',p->>'qualifications','experience',p->>'experience'),revision=revision+1 where id=pr.id;
 perform private.audit(s,'profile.factual_details_changed',pr.id,p->>'reason',jsonb_build_object('fields',jsonb_build_array('displayName','designation','qualifications','experience')));
end$$;

create function private.profile_photo(pid uuid)returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('id',a.id,'filename',a.filename,'type',a.declared_type)from public.public_assets a join public.content_publications cp on cp.id=a.publication_id where cp.profile_id=pid and cp.revoked_at is null and a.revoked_at is null and a.approved and a.state='ready'and private.profile_visible(pid)order by a.id limit 1$$;
revoke execute on function private.profile_photo(uuid)from public,anon,authenticated;
create or replace function public.profile_detail(p jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$declare pr public.teacher_profiles;begin select * into pr from public.teacher_profiles where id=(p->>'profileId')::uuid;if not private.profile_visible(pr.id)then raise exception 'PROFILE_UNAVAILABLE'using errcode='42501';end if;return jsonb_build_object('id',pr.id,'displayName',pr.display_name,'designation',pr.designation,'subjects',pr.subjects,'classes',pr.classes,'audience',pr.audience,'indexingEnabled',(select public_enabled and indexing_enabled from public.schools where id=pr.school_id),'about',pr.approved_fields,'contact',pr.contact_info,'photo',private.profile_photo(pr.id),'updates',(select coalesce(jsonb_agg(jsonb_build_object('title',title,'kind',kind,'date',date)),'[]')from public.professional_updates where profile_id=pr.id and approved),'statistics',jsonb_build_object('publishedArticleCount',(select count(*)from public.teacher_articles where profile_id=pr.id and private.article_visible(id)),'completedWorkshopCount',(select count(*)from public.professional_updates where profile_id=pr.id and approved and kind='workshop'and date<=current_date),'period','all time','refreshedAt',now()));end$$;

create or replace function public.professional_update(p jsonb)returns uuid language plpgsql security definer set search_path='' as $$declare pr public.teacher_profiles;i uuid;begin select * into pr from public.teacher_profiles where id=(p->>'profileId')::uuid;perform private.require_access(pr.school_id,true);if (private.role()='administrator'or private.role()='teacher'and pr.teacher_id=auth.uid())and p->>'action'='submit' then insert into public.professional_updates(school_id,profile_id,title,kind,date,evidence_reference)values(pr.school_id,pr.id,p->>'title',p->>'kind',(p->>'date')::date,p->>'evidenceReference')returning id into i;elsif private.role()='administrator'and p->>'action'='approve' then update public.professional_updates set approved=true where id=(p->>'id')::uuid and profile_id=pr.id returning id into i;else raise exception 'FORBIDDEN'using errcode='42501';end if;perform private.audit(pr.school_id,'professional_update.changed',i);return i;end$$;

create or replace function public.directory(p jsonb)returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(x),'[]')from(select pr.id,pr.display_name,pr.designation,pr.subjects,pr.classes,pr.approved_fields,private.profile_photo(pr.id)as photo,pr.published_at from public.teacher_profiles pr where private.profile_visible(pr.id)and(coalesce(p->>'q','')=''or to_tsvector('simple',pr.display_name||' '||pr.designation)@@plainto_tsquery('simple',p->>'q')or pr.display_name ilike '%'||replace(replace(replace(p->>'q','\','\\'),'%','\%'),'_','\_')||'%')and(coalesce(p->>'subject','')=''or p->>'subject'=any(pr.subjects))and(coalesce(p->>'className','')=''or p->>'className'=any(pr.classes))order by case when lower(pr.display_name)=lower(p->>'q')then 0 when lower(pr.display_name)like lower(p->>'q')||'%'then 1 else 2 end,lower(pr.display_name),pr.id limit least(coalesce((p->>'limit')::int,25),100)offset greatest(coalesce((p->>'offset')::int,0),0))x$$;

create function public.publication_status(p jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$declare s uuid:=private.school();aid uuid:=(p->>'articleId')::uuid;pid uuid:=(p->>'profileId')::uuid;begin
 perform private.require_access(s);
 if num_nonnulls(aid,pid)<>1 or not(private.role()='administrator'or private.role()='teacher'and(aid is not null and exists(select 1 from public.teacher_articles where id=aid and school_id=s and author_id=auth.uid())or pid is not null and exists(select 1 from public.teacher_profiles where id=pid and school_id=s and teacher_id=auth.uid())))then raise exception 'FORBIDDEN'using errcode='42501';end if;
 return(select coalesce(jsonb_agg(x),'[]')from(select a.id,a.filename,a.state,a.revoked_at as "revokedAt",o.status as "jobStatus",o.error_code as "errorCode"
 from public.public_assets a join public.content_publications cp on cp.id=a.publication_id left join public.outbox o on o.kind='asset_copy'and o.payload->>'assetId'=a.id::text
 where a.school_id=s and(aid is not null and cp.article_id=aid or pid is not null and cp.profile_id=pid)order by a.id limit 100)x);
end$$;
create function public.retry_publication_asset(p jsonb)returns void language plpgsql security definer set search_path='' as $$declare a public.public_assets;begin
 select *into a from public.public_assets where id=(p->>'id')::uuid and school_id=private.school()for update;
 if a.id is null or private.role()<>'administrator'or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'FORBIDDEN'using errcode='42501';end if;
 update public.outbox set status='pending',attempts=0,run_token=null,lease_until=null,available_at=clock_timestamp(),error_code=null where payload->>'assetId'=a.id::text and kind=case when a.revoked_at is null then 'asset_copy'else 'asset_cleanup'end and status in('failed','unavailable');
 perform private.audit(a.school_id,'publication.asset_retry',a.id,p->>'reason');
end$$;
revoke execute on function public.publication_status(jsonb),public.retry_publication_asset(jsonb)from public,anon,authenticated;
grant execute on function public.publication_status(jsonb),public.retry_publication_asset(jsonb)to authenticated;

create function private.asset_source_revoked()returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.state='clean'and new.state<>'clean'then update public.public_assets set revoked_at=clock_timestamp()where attachment_id=new.id and revoked_at is null;end if;return new;
end$$;
revoke execute on function private.asset_source_revoked()from public,anon,authenticated;
create trigger publication_source_revoked after update of state on public.attachments for each row execute function private.asset_source_revoked();
create function private.profile_publication_revoked()returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.visible and not new.visible or old.audience is distinct from new.audience then
 update public.content_publications set revoked_at=clock_timestamp(),cache_version=cache_version+1 where profile_id=new.id and revoked_at is null;
 update public.public_assets set revoked_at=clock_timestamp()where publication_id in(select id from public.content_publications where profile_id=new.id)and revoked_at is null;
 end if;return new;
end$$;
revoke execute on function private.profile_publication_revoked()from public,anon,authenticated;
create trigger profile_publication_access after update of visible,audience on public.teacher_profiles for each row execute function private.profile_publication_revoked();

-- Public profile JSON has a fixed allowlist; new draft input is checked above.
update public.teacher_profiles set approved_fields=jsonb_strip_nulls(jsonb_build_object('biography',approved_fields->'biography','teachingApproach',approved_fields->'teachingApproach','qualifications',approved_fields->'qualifications','experience',approved_fields->'experience'));
create index content_article_current on public.content_publications(article_id)where revoked_at is null and article_id is not null;
create index content_profile_current on public.content_publications(profile_id)where revoked_at is null and profile_id is not null;
create index publication_asset_cleanup_scan on public.public_assets(cleanup_checked_at,id)where revoked_at is not null;

create function public.file_status(p jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$declare a public.attachments;allowed boolean;begin
 perform private.learning_access();select *into a from public.attachments where id=(p->>'id')::uuid and school_id=private.school();
 if a.id is null then raise exception 'FILE_UNAVAILABLE'using errcode='42501';end if;
 allowed:=a.post_id is not null and exists(select 1 from public.posts where id=a.post_id and private.group_teacher(group_id))
 or a.query_message_id is not null and exists(select 1 from public.query_messages where id=a.query_message_id and private.can_query(query_id))
 or(a.article_revision_id is not null or a.profile_id is not null)and(private.role()='administrator'or private.role()='teacher'and a.uploader_id=auth.uid());
 if not coalesce(allowed,false)then raise exception 'FILE_UNAVAILABLE'using errcode='42501';end if;
 return jsonb_build_object('id',a.id,'filename',a.filename,'type',a.declared_type,'size',a.size,'state',a.state,'job',(select jsonb_build_object('id',o.id,'status',o.status,'errorCode',o.error_code)from public.outbox o where o.school_id=a.school_id and o.kind='scan'and o.payload->>'attachmentId'=a.id::text limit 1));
end$$;
revoke execute on function public.file_status(jsonb)from public,anon,authenticated;
grant execute on function public.file_status(jsonb)to authenticated;
create index attachment_article_revision on public.attachments(article_revision_id)where article_revision_id is not null;
create index attachment_profile on public.attachments(profile_id)where profile_id is not null;
create index profile_approved_revision on public.teacher_profiles(approved_revision)where approved_revision is not null;

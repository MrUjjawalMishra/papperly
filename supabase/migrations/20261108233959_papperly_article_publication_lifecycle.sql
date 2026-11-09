alter table public.teacher_articles add column archived_author boolean not null default false;
create table public.publisher_grants(
 school_id uuid not null,teacher_id uuid not null,audience text not null check(audience in('school','public')),
 granted_by uuid not null,expires_at timestamptz,revoked_at timestamptz,revision int not null default 1,
 primary key(school_id,teacher_id,audience),foreign key(school_id,teacher_id)references public.memberships(school_id,id));
alter table public.publisher_grants enable row level security;
create policy read_scope on public.publisher_grants for select to authenticated using(school_id=private.school()and(private.role()='administrator'or teacher_id=auth.uid()and private.role()='teacher'));
create policy identity_current on public.publisher_grants as restrictive for all to authenticated using(private.role()is not null)with check(private.role()is not null);
grant select on public.publisher_grants to authenticated;
create function public.manage_publisher(p jsonb)returns void language plpgsql security definer set search_path='' as $$declare s uuid:=private.school();u uuid:=(p->>'teacherId')::uuid;begin
 perform private.require_access(s);if private.role()<>'administrator'or length(trim(coalesce(p->>'reason','')))=0 or p->>'audience'not in('school','public')or p->>'action'not in('grant','revoke')then raise exception 'FORBIDDEN'using errcode='42501';end if;
 if not exists(select 1 from public.memberships where id=u and school_id=s and role='teacher'and active)then raise exception 'FORBIDDEN'using errcode='42501';end if;
 if p->>'action'='grant'then
 if p->>'audience'='public'and not exists(select 1 from public.schools where id=s and public_enabled)then raise exception 'PUBLIC_NOT_ENABLED';end if;
 if p->>'expiresAt'is not null and(p->>'expiresAt')::timestamptz<=clock_timestamp()then raise exception 'INVALID_EXPIRY';end if;
 insert into public.publisher_grants(school_id,teacher_id,audience,granted_by,expires_at)values(s,u,p->>'audience',auth.uid(),(p->>'expiresAt')::timestamptz)on conflict(school_id,teacher_id,audience)do update set granted_by=auth.uid(),expires_at=excluded.expires_at,revoked_at=null,revision=publisher_grants.revision+1;
 else update public.publisher_grants set revoked_at=clock_timestamp(),revision=revision+1 where school_id=s and teacher_id=u and audience=p->>'audience';end if;
 perform private.audit(s,'article.publisher.'||(p->>'action'),u,p->>'reason',jsonb_build_object('audience',p->>'audience'));
end$$;

create function private.article_visible(aid uuid)returns boolean language sql stable security definer set search_path='' as $$select exists(
 select 1 from public.teacher_articles a join public.article_revisions r on r.id=a.published_revision and r.article_id=a.id and r.state='approved'
 join public.teacher_profiles pr on pr.id=a.profile_id join public.memberships m on m.id=a.author_id join public.schools s on s.id=a.school_id
 where a.id=aid and not a.archived and s.status='active'and(m.active and pr.visible or not m.active and a.archived_author)
 and not private.active_attempt()and((private.school()=a.school_id and private.role()is not null)or a.audience='public'and s.public_enabled))$$;
revoke execute on function private.article_visible(uuid)from public,anon;
grant execute on function private.article_visible(uuid)to authenticated;

create or replace function public.write_article(p jsonb)returns uuid language plpgsql security definer set search_path='' as $$
declare s uuid:=private.school();a public.teacher_articles;pr public.teacher_profiles;rid uuid;actor text:=private.role();begin
 perform private.require_access(s,true);select * into pr from public.teacher_profiles where id=(p->>'profileId')::uuid and school_id=s;
 if pr.id is null or not(actor='administrator'or actor='teacher'and pr.teacher_id=auth.uid())then raise exception 'FORBIDDEN'using errcode='42501';end if;
 if p->>'state'is null or p->>'state'not in('draft','submitted')or length(coalesce(p->>'title',''))not between 1 and 200 or length(coalesce(p->>'body',''))not between 1 and 20000 or length(coalesce(p->>'summary',''))not between 1 and 20000 or length(coalesce(p->>'subject',''))not between 1 and 200 then raise exception 'INVALID_ARTICLE';end if;
 if p->>'articleId'is null then
 insert into public.teacher_articles(school_id,author_id,profile_id)values(s,pr.teacher_id,pr.id)returning * into a;
 else
 select * into a from public.teacher_articles where id=(p->>'articleId')::uuid and school_id=s for update;
 if a.id is null or a.profile_id<>pr.id or not(actor='administrator'or a.author_id=auth.uid())then raise exception 'FORBIDDEN'using errcode='42501';end if;
 if a.revision is distinct from(p->>'revision')::int then raise exception 'STALE_REVISION';end if;
 update public.teacher_articles set revision=revision+1 where id=a.id;
 end if;
 insert into public.article_revisions(school_id,article_id,editor_id,title,summary,subject,body,state)values(s,a.id,auth.uid(),p->>'title',p->>'summary',p->>'subject',p->>'body',p->>'state')returning id into rid;
 perform private.audit(s,'article.revised',a.id,p->>'reason',jsonb_build_object('revisionId',rid));return rid;
end$$;
create or replace function public.moderate_article(p jsonb)returns void language plpgsql security definer set search_path='' as $$
declare s uuid:=private.school();actor text:=private.role();a public.teacher_articles;r public.article_revisions;aud text:=p->>'audience';begin
 perform private.require_access(s,p->>'action'='publish');select * into a from public.teacher_articles where id=(p->>'articleId')::uuid and school_id=s for update;
 if a.id is null or length(trim(coalesce(p->>'reason','')))=0 or not(actor='administrator'or actor='teacher'and a.author_id=auth.uid())then raise exception 'FORBIDDEN'using errcode='42501';end if;
 if p?'revision'and a.revision is distinct from(p->>'revision')::int then raise exception 'STALE_REVISION';end if;
 if p->>'action'='publish'then
 if aud is null or aud not in('school','public')then raise exception 'INVALID_AUDIENCE';end if;
 if actor<>'administrator'and not exists(select 1 from public.publisher_grants where school_id=s and teacher_id=auth.uid()and audience=aud and revoked_at is null and(expires_at is null or expires_at>clock_timestamp()))then raise exception 'FORBIDDEN'using errcode='42501';end if;
 if aud='public'and not exists(select 1 from public.schools where id=s and public_enabled)then raise exception 'PUBLIC_NOT_ENABLED';end if;
 if a.published_revision=(p->>'revisionId')::uuid and a.audience=aud and not a.archived then return;end if;
 select * into r from public.article_revisions where id=(p->>'revisionId')::uuid and article_id=a.id and state in('submitted','approved');
 if r.id is null then raise exception 'INVALID_REVISION';end if;
 -- Reapproval/audience changes retire every prior publication and asset first.
 update public.content_publications set revoked_at=clock_timestamp(),cache_version=cache_version+1 where article_id=a.id and revoked_at is null;
 update public.public_assets set revoked_at=clock_timestamp()where publication_id in(select id from public.content_publications where article_id=a.id)and revoked_at is null;
 update public.article_revisions set state='approved'where id=r.id;
 update public.teacher_articles set published_revision=r.id,audience=aud,published_at=clock_timestamp(),archived=false,archived_author=false,revision=revision+1 where id=a.id;
 insert into public.content_publications(school_id,article_id,audience)values(s,a.id,aud);
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

create function public.article_detail(p jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$declare a public.teacher_articles;r public.article_revisions;pr public.teacher_profiles;begin
 select * into a from public.teacher_articles where id=(p->>'articleId')::uuid;
 if not private.article_visible(a.id)then raise exception 'ARTICLE_UNAVAILABLE'using errcode='42501';end if;
 select * into r from public.article_revisions where id=a.published_revision;select * into pr from public.teacher_profiles where id=a.profile_id;
 return jsonb_build_object('id',a.id,'revisionId',r.id,'title',r.title,'summary',r.summary,'subject',r.subject,'body',r.body,'author',jsonb_build_object('displayName',pr.display_name,'archived',a.archived_author,'profileId',case when private.profile_visible(pr.id)then pr.id end),'audience',a.audience,'publishedAt',a.published_at,'indexingEnabled',(select indexing_enabled from public.schools where id=a.school_id),'assets','[]'::jsonb);
end$$;
create function public.profile_articles(p jsonb)returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(x),'[]')from(
 select a.id,r.title,r.summary,r.subject,a.published_at as "publishedAt",a.audience,a.archived_author as "archivedAuthor"
 from public.teacher_articles a join public.article_revisions r on r.id=a.published_revision
 where a.profile_id=(p->>'profileId')::uuid and private.article_visible(a.id)and(p->>'subject'is null or r.subject=p->>'subject')
 and(p->>'q'is null or r.title ilike '%'||replace(replace(replace(p->>'q','\','\\'),'%','\%'),'_','\_')||'%')
 order by a.published_at desc,a.id limit least(greatest(coalesce((p->>'limit')::int,25),1),100)offset greatest(coalesce((p->>'offset')::int,0),0))x$$;
revoke execute on function public.manage_publisher(jsonb),public.article_detail(jsonb),public.profile_articles(jsonb)from public,anon,authenticated;
grant execute on function public.manage_publisher(jsonb)to authenticated;
grant execute on function public.article_detail(jsonb),public.profile_articles(jsonb)to anon,authenticated;

drop policy read_scope on public.teacher_articles;
create policy read_scope on public.teacher_articles for select to authenticated using(private.article_visible(id)or school_id=private.school()and(private.role()='administrator'or private.role()='teacher'and author_id=auth.uid()));
drop policy read_scope on public.article_revisions;
create policy read_scope on public.article_revisions for select to authenticated using(exists(select 1 from public.teacher_articles a where a.id=article_id and(a.published_revision=article_revisions.id and private.article_visible(a.id)or a.school_id=private.school()and(private.role()='administrator'or private.role()='teacher'and a.author_id=auth.uid()))));

create or replace function public.deactivate_user(p jsonb)returns void language plpgsql security definer set search_path='' as $$declare m public.memberships;policy text:=p->>'articlePolicy';begin
 select * into m from public.memberships where id=(p->>'userId')::uuid for update;
 if m.id is null or m.school_id is distinct from private.school()or not(private.role()='administrator'and m.role in('teacher','student')or private.role()='teacher'and m.role='student'and private.student_access(m.id))or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'FORBIDDEN'using errcode='42501';end if;
 if m.role='teacher'and exists(select 1 from public.teacher_articles where author_id=m.id and published_revision is not null and not archived)then
 if policy is null or policy not in('retain','unpublish')then raise exception 'ARTICLE_POLICY_REQUIRED';end if;
 if policy='retain'then update public.teacher_articles set archived_author=true,revision=revision+1 where author_id=m.id and published_revision is not null and not archived;
 else
 update public.teacher_articles set published_revision=null,published_at=null,revision=revision+1 where author_id=m.id;
 update public.content_publications set revoked_at=clock_timestamp(),cache_version=cache_version+1 where article_id in(select id from public.teacher_articles where author_id=m.id)and revoked_at is null;
 update public.public_assets set revoked_at=clock_timestamp()where publication_id in(select cp.id from public.content_publications cp join public.teacher_articles a on a.id=cp.article_id where a.author_id=m.id)and revoked_at is null;
 end if;end if;
 update public.memberships set active=false,credential_version=credential_version+1,auth_revoked_before=clock_timestamp()where id=m.id;
 update private.sessions set revoked_at=clock_timestamp()where user_id=m.id;
 update public.teacher_profiles set visible=false,revision=revision+1 where teacher_id=m.id;
 update public.publisher_grants set revoked_at=clock_timestamp(),revision=revision+1 where teacher_id=m.id and revoked_at is null;
 perform private.audit(m.school_id,'account.deactivated',m.id,p->>'reason',jsonb_build_object('articlePolicy',policy));
end$$;
alter table public.publisher_grants add foreign key(school_id,granted_by)references public.memberships(school_id,id);
create index publisher_grantor on public.publisher_grants(school_id,granted_by);

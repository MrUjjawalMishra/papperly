-- Provider JWTs can outlive password changes. In addition to opaque Worker
-- sessions, require a live Auth session newer than the credential-revocation epoch.
alter table public.memberships add column auth_revoked_before timestamptz;

create function private.provider_session_valid(uid uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when auth.jwt()->>'role'='service_role' then true
 else exists (
   select 1 from auth.sessions s join public.memberships m on m.id=s.user_id
   where s.id=case when coalesce(auth.jwt()->>'session_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     then (auth.jwt()->>'session_id')::uuid else null end
     and s.user_id=uid and m.active
     and (s.not_after is null or s.not_after>now())
     and (m.auth_revoked_before is null or s.created_at>=m.auth_revoked_before)
 ) end
$$;
revoke execute on function private.provider_session_valid(uuid) from public,anon,authenticated;
grant execute on function private.provider_session_valid(uuid) to service_role;

create or replace function private.role() returns text
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();r text;
begin
 if u is null then
   if auth.jwt()->>'role'='authenticated' or current_setting('role',true)='authenticated' then
     raise exception 'FORBIDDEN' using errcode='42501';
   end if;
   return null; -- Explicit anonymous/public paths; no authenticated NULL fall-through.
 end if;
 select m.role into r from public.memberships m left join public.schools s on s.id=m.school_id
 where m.id=u and m.active and (m.role='owner' or s.status='active');
 if r is null then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if not private.provider_session_valid(u) then raise exception 'SESSION_REVOKED' using errcode='42501';end if;
 return r;
end$$;
create or replace function private.school() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare s uuid;
begin
 perform private.role();
 select school_id into s from public.memberships where id=auth.uid() and active;
 return s;
end$$;

create or replace function public.runtime_credentials_revoke(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare m public.memberships;actor public.memberships;
begin
 select * into m from public.memberships where id=(p->>'userId')::uuid for update;
 select * into actor from public.memberships where id=(p->>'actorId')::uuid;
 if m.id is null or actor.id is null then raise exception 'FORBIDDEN' using errcode='42501';end if;
 update public.memberships set credential_version=credential_version+1,
   auth_revoked_before=clock_timestamp(),
   must_change_password=case when m.id=actor.id then false else m.role<>'student' end where id=m.id;
 update private.sessions set revoked_at=now() where user_id=m.id;
 insert into public.audit_events(school_id,actor_id,actor_role,subject_id,action,reason)
 values(m.school_id,actor.id,actor.role,m.id,'account.credentials.revoked',p->>'reason');
end$$;
revoke execute on function public.runtime_credentials_revoke(jsonb) from public,anon,authenticated;
grant execute on function public.runtime_credentials_revoke(jsonb) to service_role;

create or replace function public.force_logout(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare m public.memberships;actor_role text:=private.role();
begin
 select * into m from public.memberships where id=(p->>'userId')::uuid;
 if m.id is null or length(coalesce(p->>'reason',''))=0 or not (
   actor_role='owner' and m.role='administrator' or
   m.school_id=private.school() and (actor_role='administrator' and m.role in('teacher','student') or actor_role='teacher' and m.role='student' and private.student_access(m.id))
 ) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 update public.memberships set auth_revoked_before=clock_timestamp() where id=m.id;
 update private.sessions set revoked_at=now() where user_id=m.id;
 perform private.audit(m.school_id,'account.force_logout',m.id,p->>'reason');
end$$;

-- Additional defense for all authenticated table reads/writes, including public projections.
do $policy$ declare t text;begin
 foreach t in array array['schools','subscriptions','memberships','classes','teacher_assignments','student_registry','enrollments','audit_events','import_jobs','import_rows','outbox','notifications','question_drafts','exam_versions','exam_questions','exam_recipients','attempts','answers','results','integrity_events','integrity_reviews','groups','group_memberships','posts','post_reads','query_policies','queries','query_cycles','query_messages','deadline_revisions','attachments','student_insights','teacher_feedback','report_exports','teacher_profiles','profile_revisions','professional_updates','teacher_articles','article_revisions','content_publications','public_assets','exam_managers','curriculum_topics','question_topic_tags','group_teachers','query_teachers','teacher_query_defaults'] loop
 execute format('create policy identity_current on public.%I as restrictive for all to authenticated using(private.role() is not null) with check(private.role() is not null)',t);
 end loop;
end $policy$;

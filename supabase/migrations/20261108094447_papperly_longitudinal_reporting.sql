-- Live projections avoid shared caches. Every section rechecks current scope.
create function private.report_class_scope(cid uuid,p jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.classes c where c.id=cid and c.school_id=private.school()
 and (p->>'classId' is null or c.id=(p->>'classId')::uuid)
 and (p->>'academicYear' is null or c.academic_year=p->>'academicYear')
 and (p->>'section' is null or c.section=p->>'section'))
$$;
revoke execute on function private.report_class_scope(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.report_class_scope(uuid,jsonb) to service_role;

create or replace function public.student_progress(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=coalesce((p->>'studentId')::uuid,auth.uid());s uuid:=private.school();actor text:=private.role();
 n int:=least(greatest(coalesce((p->>'limit')::int,100),1),100);off int:=greatest(coalesce((p->>'offset')::int,0),0);
 r jsonb;published jsonb;history jsonb;assignments jsonb;feedback jsonb;queries jsonb;groups jsonb;topics jsonb;guidance jsonb;
 earned bigint;maximum bigint;total_count int;
begin
 perform private.learning_access();
 if actor not in('student','teacher','administrator') or not exists(select 1 from public.memberships where id=u and school_id=s and role='student')
 or (u<>auth.uid() and (actor='student' or not private.student_access(u))) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p->>'from' is not null and p->>'to' is not null and (p->>'from')::timestamptz>=(p->>'to')::timestamptz then raise exception 'INVALID_PERIOD';end if;
 select count(*),sum(rr.total),sum(rr.maximum) into total_count,earned,maximum
 from public.results rr join public.exam_versions e on e.id=rr.version_id
 where rr.student_id=u and rr.school_id=s and private.report_result(e.id,u) and private.report_class_scope(e.class_id,p)
 and (p->>'subject' is null or e.subject=p->>'subject')
 and (p->>'from' is null or rr.published_at>=(p->>'from')::timestamptz) and (p->>'to' is null or rr.published_at<(p->>'to')::timestamptz);
 select coalesce(jsonb_agg(x order by x."publishedAt",x.id),'[]') into published from(
 select rr.id,rr.version_id as "versionId",e.subject,e.class_id as "classId",c.academic_year as "academicYear",e.title,
 rr.total,rr.maximum,rr.scores,rr.revision,rr.published_at as "publishedAt"
 from public.results rr join public.exam_versions e on e.id=rr.version_id join public.classes c on c.id=e.class_id
 where rr.student_id=u and rr.school_id=s and private.report_result(e.id,u) and private.report_class_scope(e.class_id,p)
 and (p->>'subject' is null or e.subject=p->>'subject')
 and (p->>'from' is null or rr.published_at>=(p->>'from')::timestamptz) and (p->>'to' is null or rr.published_at<(p->>'to')::timestamptz)
 order by rr.published_at,rr.id limit n offset off)x;
 select coalesce(jsonb_agg(x order by x."academicYear",x."classId"),'[]') into history from(
 select e.class_id as "classId",c.academic_year as "academicYear",c.name as "className",c.section,e.roll,e.active
 from public.enrollments e join public.classes c on c.id=e.class_id
 where e.student_id=u and e.school_id=s and private.report_class_scope(c.id,p)
 and (actor<>'teacher' or private.assigned(c.id,p->>'subject'))
 order by c.academic_year,c.id limit n offset off)x;
 select coalesce(jsonb_agg(x order by x."opensAt",x."versionId"),'[]') into assignments from(
 select e.id as "versionId",e.class_id as "classId",e.subject,e.title,e.opens_at as "opensAt",rec.closes_at as "closesAt",rec.exempt,
 case when rec.exempt then 'exempt' when e.status='cancelled' then 'cancelled' when rr.id is not null then 'published'
 when a.finalized_at is not null then 'awaiting_marks' when rec.closes_at<=now() then 'missing_submission' when a.id is not null then 'in_progress' else 'assigned' end as state,
 a.finalized_at as "finalizedAt",rr.id as "resultId"
 from public.exam_recipients rec join public.exam_versions e on e.id=rec.version_id
 left join public.attempts a on a.version_id=e.id and a.student_id=u left join public.results rr on rr.attempt_id=a.id
 where rec.student_id=u and rec.school_id=s and private.report_result(e.id,u) and private.report_class_scope(e.class_id,p)
 and (p->>'subject' is null or e.subject=p->>'subject')
 and (p->>'from' is null or rec.closes_at>=(p->>'from')::timestamptz) and (p->>'to' is null or e.opens_at<(p->>'to')::timestamptz)
 order by e.opens_at,e.id limit n offset off)x;
 select coalesce(jsonb_agg(x order by x."createdAt",x.id),'[]') into feedback from(
 select f.id,f.class_id as "classId",f.subject,f.body,f.created_at as "createdAt"
 from public.teacher_feedback f where f.student_id=u and f.school_id=s and private.report_class_scope(f.class_id,p)
 and (actor<>'teacher' or private.assigned(f.class_id,f.subject)) and (p->>'subject' is null or f.subject=p->>'subject')
 and (p->>'from' is null or f.created_at>=(p->>'from')::timestamptz) and (p->>'to' is null or f.created_at<(p->>'to')::timestamptz)
 order by f.created_at,f.id limit n offset off)x;
 -- Metadata only. No raw query text, topic, reply body or staff notes.
 select coalesce(jsonb_agg(x order by x."createdAt",x.id),'[]') into queries from(
 select q.id,q.class_id as "classId",q.subject,q.state,q.cycle,q.created_at as "createdAt",cy.original_due_at as "originalDueAt",cy.due_at as "dueAt",
 cy.first_response_at as "firstResponseAt",cy.solution_delivered_at as "solutionDeliveredAt",cy.student_resolved_at as "resolvedAt",
 (cy.solution_delivered_at is null and cy.due_at<now() and q.state not in('resolved','withdrawn')) as overdue
 from public.queries q join public.query_cycles cy on cy.query_id=q.id and cy.cycle=q.cycle
 where q.student_id=u and q.school_id=s and private.report_class_scope(q.class_id,p)
 and (actor<>'teacher' or private.assigned(q.class_id,q.subject)) and (p->>'subject' is null or q.subject=p->>'subject')
 and (p->>'from' is null or q.created_at>=(p->>'from')::timestamptz) and (p->>'to' is null or q.created_at<(p->>'to')::timestamptz)
 order by q.created_at,q.id limit n offset off)x;
 select coalesce(jsonb_agg(x order by x.id),'[]') into groups from(
 select g.id,g.class_id as "classId",g.subject,g.title,gm.state,g.archived
 from public.group_memberships gm join public.groups g on g.id=gm.group_id
 where gm.student_id=u and g.school_id=s and private.report_class_scope(g.class_id,p)
 and (actor<>'teacher' or private.assigned(g.class_id,g.subject)) and (p->>'subject' is null or g.subject=p->>'subject')
 order by g.id limit n offset off)x;
 select coalesce(jsonb_agg(x order by x.subject,x."classId",x.topic),'[]') into topics from(
 select e.subject,e.class_id as "classId",coalesce(q.content->>'primaryTopic','Unclassified') as topic,
 sum((unit->>'score')::int) as earned,sum((unit->>'maximum')::int) as maximum,count(*) as "scoredUnits",count(distinct e.id) as assessments,
 case when count(*)>=3 and count(distinct e.id)>=2 then 'recurring-evidence' else 'more-evidence-needed' end as sufficiency,
 jsonb_agg(distinct rr.id) as "resultIds"
 from public.results rr join public.exam_versions e on e.id=rr.version_id join public.exam_questions q on q.version_id=e.id
 cross join lateral jsonb_array_elements(rr.scores) unit
 where rr.student_id=u and rr.school_id=s and unit->>'questionId'=q.id::text and private.report_result(e.id,u) and private.report_class_scope(e.class_id,p)
 and (p->>'subject' is null or e.subject=p->>'subject')
 and (p->>'from' is null or rr.published_at>=(p->>'from')::timestamptz) and (p->>'to' is null or rr.published_at<(p->>'to')::timestamptz)
 group by e.subject,e.class_id,coalesce(q.content->>'primaryTopic','Unclassified') order by e.subject,e.class_id,topic limit n offset off)x;
 -- Guidance is an all-subject snapshot: do not expose it to subject-scoped teachers or pretend it matches filtered reports.
 if actor in('student','administrator') and p->>'subject' is null and p->>'classId' is null and p->>'academicYear' is null and p->>'from' is null and p->>'to' is null then
 select jsonb_build_object('status',i.status,'content',case when not i.suppressed then i.content end,'correction',i.correction,'suppressed',i.suppressed,'sourceVersion',i.source_version,'updatedAt',i.updated_at,'aiGenerated',true)
 into guidance from public.student_insights i where i.student_id=u and i.school_id=s;end if;
 r:=jsonb_build_object('studentId',u,'school',jsonb_build_object('id',s,'name',(select name from public.schools where id=s)),
 'count',total_count,'earned',earned,'maximum',maximum,'percentage',100.0*earned/nullif(maximum,0),'results',published,
 'enrollmentHistory',history,'assignments',assignments,'feedback',feedback,'queryMetadata',queries,'groups',groups,'topics',topics,'guidance',guidance,
 'filters',p,'pagination',jsonb_build_object('limit',n,'offset',off,'resultTotal',total_count,'sectionPageLengths',jsonb_build_object('enrollmentHistory',jsonb_array_length(history),'assignments',jsonb_array_length(assignments),'feedback',jsonb_array_length(feedback),'queryMetadata',jsonb_array_length(queries),'groups',jsonb_array_length(groups),'topics',jsonb_array_length(topics))));
 return r||jsonb_build_object('sourceFingerprint',md5(r::text),'generatedAt',now());
end$$;

-- A conservative per-school revision also invalidates exports when out-of-page
-- records or access mappings change. Answers/keys/private messages are excluded.
create table private.report_versions(school_id uuid primary key references public.schools(id),revision bigint not null default 1);
alter table private.report_versions enable row level security;
create function private.bump_report_version() returns trigger language plpgsql security definer set search_path='' as $$
declare s uuid;begin
 if tg_table_name='schools' then s:=coalesce(new.id,old.id);else s:=coalesce(new.school_id,old.school_id);end if;
 if s is not null and exists(select 1 from public.schools where id=s) then
 insert into private.report_versions(school_id,revision)values(s,1)on conflict(school_id)do update set revision=private.report_versions.revision+1;end if;
 return coalesce(new,old);
end$$;
revoke execute on function private.bump_report_version() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['schools','memberships','classes','teacher_assignments','enrollments','exam_versions','exam_recipients','attempts','results','teacher_feedback','groups','group_memberships','queries','query_cycles','student_insights'] loop
 execute format('create trigger report_revision after insert or update or delete on public.%I for each row execute function private.bump_report_version()',t);end loop;
end$$;
-- Include the full-scope revision without reimplementing the report body.
alter function public.student_progress(jsonb) rename to student_progress_projection;
alter function public.student_progress_projection(jsonb) set schema private;
revoke execute on function private.student_progress_projection(jsonb) from public,anon,authenticated;
create function public.student_progress(p jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;v bigint;begin
 r:=private.student_progress_projection(p);
 select revision into v from private.report_versions where school_id=private.school();
 return r||jsonb_build_object('sourceFingerprint',md5(jsonb_build_object('report',r-'generatedAt','scopeRevision',coalesce(v,0),'actor',auth.uid())::text));
end$$;
revoke execute on function public.student_progress(jsonb) from public,anon;
grant execute on function public.student_progress(jsonb) to authenticated;

alter table public.report_exports add column source_fingerprint text;
create or replace function public.request_export(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare s uuid:=private.school();u uuid:=(p->>'studentId')::uuid;i uuid;r jsonb;begin
 if private.role() not in('teacher','administrator') or not private.student_access(u) or coalesce(p->>'format','csv')not in('csv','printable') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 r:=public.student_progress(p);
 insert into public.report_exports(school_id,actor_id,filters,source_version,source_fingerprint)
 values(s,auth.uid(),p,coalesce((select sum(revision)from public.results where student_id=u),0),r->>'sourceFingerprint')returning id into i;
 insert into public.outbox(school_id,kind,dedup_key,payload)values(s,'export','export:'||i,jsonb_build_object('exportId',i));
 perform private.audit(s,'report.export',u);return i;
end$$;
create or replace function public.runtime_export_data(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.report_exports;old text:=current_setting('request.jwt.claim.sub',true);r jsonb;page jsonb;combined jsonb;k text;off int:=0;more boolean;
begin
 select * into e from public.report_exports where id=(p->>'id')::uuid and expires_at>now() and status='pending';if not found then return null;end if;
 perform set_config('request.jwt.claim.sub',e.actor_id::text,true);
 r:=public.student_progress(e.filters);
 if e.source_fingerprint is distinct from r->>'sourceFingerprint' then raise exception 'EXPORT_STALE';end if;
 combined:=r;
 loop
 page:=public.student_progress(e.filters||jsonb_build_object('limit',100,'offset',off));more:=false;
 foreach k in array array['results','enrollmentHistory','assignments','feedback','queryMetadata','groups','topics'] loop
 if off=0 then combined:=jsonb_set(combined,array[k],page->k);else combined:=jsonb_set(combined,array[k],(combined->k)||(page->k));end if;
 more:=more or jsonb_array_length(page->k)=100;
 end loop;
 exit when not more;
 off:=off+100;if off>=10000 then raise exception 'EXPORT_TOO_LARGE';end if;
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(old,''),true);
 return jsonb_build_object('exportId',e.id,'schoolId',e.school_id,'filters',e.filters,'sourceFingerprint',e.source_fingerprint,'data',combined);
exception when others then perform set_config('request.jwt.claim.sub',coalesce(old,''),true);raise;
end$$;
create or replace function public.runtime_export_finish(p jsonb)returns void language plpgsql security definer set search_path='' as $$
declare e public.report_exports;old text:=current_setting('request.jwt.claim.sub',true);r jsonb;begin
 select * into e from public.report_exports where id=(p->>'id')::uuid and expires_at>now() and status='pending' for update;if not found then raise exception 'EXPORT_UNAVAILABLE';end if;
 perform set_config('request.jwt.claim.sub',e.actor_id::text,true);r:=public.student_progress(e.filters);
 if e.source_fingerprint is distinct from r->>'sourceFingerprint' or (p ? 'sourceFingerprint' and p->>'sourceFingerprint' is distinct from e.source_fingerprint) then raise exception 'EXPORT_STALE';end if;
 update public.report_exports set object_key=p->>'objectKey',status='ready' where id=e.id;
 perform set_config('request.jwt.claim.sub',coalesce(old,''),true);
exception when others then perform set_config('request.jwt.claim.sub',coalesce(old,''),true);raise;
end$$;
create or replace function public.export_download(p jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.report_exports;r jsonb;begin
 select * into e from public.report_exports where id=(p->>'id')::uuid and actor_id=auth.uid() and school_id=private.school() and expires_at>now() and status='ready';
 if not found then raise exception 'EXPORT_UNAVAILABLE' using errcode='42501';end if;
 r:=public.student_progress(e.filters);
 if e.source_fingerprint is distinct from r->>'sourceFingerprint' then raise exception 'EXPORT_UNAVAILABLE' using errcode='42501';end if;
 return jsonb_build_object('objectKey',e.object_key,'format',coalesce(e.filters->>'format','csv'));
end$$;

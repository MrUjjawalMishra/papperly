create table public.school_terms(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
 academic_year text not null,name text not null,starts_at timestamptz not null,ends_at timestamptz not null,
 revision int not null default 1,unique(school_id,academic_year,name),check(ends_at>starts_at));
alter table public.school_terms enable row level security;
create policy read_scope on public.school_terms for select to authenticated using(school_id=private.school());
create policy identity_current on public.school_terms as restrictive for all to authenticated using(private.role() is not null)with check(private.role() is not null);
grant select on public.school_terms to authenticated;
create trigger report_revision after insert or update or delete on public.school_terms for each row execute function private.bump_report_version();
create function public.manage_term(p jsonb)returns uuid language plpgsql security definer set search_path='' as $$
declare s uuid:=private.school();i uuid;begin
 perform private.require_access(s,true);
 if private.role()<>'administrator' or length(trim(coalesce(p->>'reason','')))=0 or length(trim(coalesce(p->>'name','')))=0 or length(trim(coalesce(p->>'academicYear','')))=0 then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p->>'id' is null then
 insert into public.school_terms(school_id,academic_year,name,starts_at,ends_at)values(s,p->>'academicYear',p->>'name',(p->>'startsAt')::timestamptz,(p->>'endsAt')::timestamptz)returning id into i;
 else
 update public.school_terms set academic_year=p->>'academicYear',name=p->>'name',starts_at=(p->>'startsAt')::timestamptz,ends_at=(p->>'endsAt')::timestamptz,revision=revision+1
 where id=(p->>'id')::uuid and school_id=s and revision=(p->>'revision')::int returning id into i;
 if i is null then raise exception 'STALE_REVISION';end if;end if;
 perform private.audit(s,'school.term.changed',i,p->>'reason');return i;
end$$;
revoke execute on function public.manage_term(jsonb)from public,anon;
grant execute on function public.manage_term(jsonb)to authenticated;
create function private.report_filters(p jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.school_terms;f timestamptz;last_at timestamptz;begin
 if p->>'termId' is null then return p;end if;
 select * into t from public.school_terms where id=(p->>'termId')::uuid and school_id=private.school();
 if not found then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p->>'academicYear' is not null and p->>'academicYear'<>t.academic_year then raise exception 'INVALID_PERIOD';end if;
 f:=greatest(t.starts_at,coalesce((p->>'from')::timestamptz,t.starts_at));last_at:=least(t.ends_at,coalesce((p->>'to')::timestamptz,t.ends_at));
 if last_at<=f then raise exception 'INVALID_PERIOD';end if;
 return p||jsonb_build_object('academicYear',t.academic_year,'from',f,'to',last_at);
end$$;
revoke execute on function private.report_filters(jsonb)from public,anon,authenticated;
create or replace function public.student_progress(p jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;v bigint;begin
 p:=private.report_filters(p);r:=private.student_progress_projection(p);
 select revision into v from private.report_versions where school_id=private.school();
 return r||jsonb_build_object('sourceFingerprint',md5(jsonb_build_object('report',r-'generatedAt','scopeRevision',coalesce(v,0),'actor',auth.uid())::text));
end$$;
create index results_student_period on public.results(school_id,student_id,published_at,id);
create index feedback_student_period on public.teacher_feedback(school_id,student_id,created_at,id);
create index queries_student_period on public.queries(school_id,student_id,created_at,id);
create index group_memberships_student on public.group_memberships(student_id,group_id);
create index enrollments_student_history on public.enrollments(student_id,class_id);
create index recipients_student on public.exam_recipients(student_id,version_id);

create or replace function public.learning_statistics(p jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$declare u uuid:=coalesce((p->>'studentId')::uuid,auth.uid());r record;unit jsonb;answered int:=0;correct int:=0;unanswered int:=0;eligible int;finalized int;ontime int;v int;topics jsonb;begin p:=private.report_filters(p);perform private.learning_access();if u<>auth.uid()and not private.student_access(u)then raise exception 'FORBIDDEN'using errcode='42501';end if;
for r in select q.content,k.key,a.response from public.results rr join public.exam_questions q on q.version_id=rr.version_id join private.question_keys k on k.version_id=q.version_id and k.question_id=q.id left join public.answers a on a.attempt_id=rr.attempt_id and a.question_id=q.id join public.exam_versions e on e.id=rr.version_id where rr.student_id=u and rr.school_id=private.school()and private.report_result(rr.version_id,u)and private.report_class_scope(e.class_id,p)and(p->>'subject'is null or e.subject=p->>'subject')and(p->>'from'is null or rr.published_at>=(p->>'from')::timestamptz)and(p->>'to'is null or rr.published_at<(p->>'to')::timestamptz)loop
if r.content->>'type'='subjective'then continue;end if;if r.content->>'type'in('mcq','boolean')then if r.response is null or r.response='null'::jsonb then unanswered:=unanswered+1;else answered:=answered+1;if private.objective_score(r.content,r.key,r.response)>0 then correct:=correct+1;end if;end if;else for unit in select value from jsonb_array_elements(r.key->'units')loop if coalesce(r.response->>(unit->>'id'),'')=''then unanswered:=unanswered+1;else answered:=answered+1;v:=private.objective_score(r.content,jsonb_build_object('units',jsonb_build_array(unit)),r.response);if v>0 then correct:=correct+1;end if;end if;end loop;end if;end loop;
select count(*),count(a.finalized_at),count(*)filter(where a.finalized_at<=a.deadline)into eligible,finalized,ontime from public.exam_recipients rec join public.exam_versions e on e.id=rec.version_id left join public.attempts a on a.version_id=rec.version_id and a.student_id=u where rec.student_id=u and rec.school_id=private.school()and not rec.exempt and e.status<>'cancelled'and rec.closes_at<=now()and(p->>'from'is null or rec.closes_at>=(p->>'from')::timestamptz)and(p->>'to'is null or rec.closes_at<(p->>'to')::timestamptz)and private.report_result(e.id,u)and private.report_class_scope(e.class_id,p)and(p->>'subject'is null or e.subject=p->>'subject');
select coalesce(jsonb_agg(t),'[]')into topics from(select e.class_id,e.subject,coalesce(q.content->>'primaryTopic','Unclassified')as topic,sum((published_score->>'score')::int)as earned,sum((published_score->>'maximum')::int)as maximum,count(*)as scored_units,count(distinct rr.version_id)as assessments,case when count(*)>=3 and count(distinct rr.version_id)>=2 then 'recurring-evidence'else 'more-evidence-needed'end as sufficiency from public.results rr join public.exam_questions q on q.version_id=rr.version_id cross join lateral jsonb_array_elements(rr.scores)published_score join public.exam_versions e on e.id=rr.version_id where published_score->>'questionId'=q.id::text and rr.student_id=u and rr.school_id=private.school()and private.report_result(rr.version_id,u)and private.report_class_scope(e.class_id,p)and(p->>'subject'is null or e.subject=p->>'subject')and(p->>'from'is null or rr.published_at>=(p->>'from')::timestamptz)and(p->>'to'is null or rr.published_at<(p->>'to')::timestamptz)group by e.class_id,e.subject,coalesce(q.content->>'primaryTopic','Unclassified'))t;
return jsonb_build_object('answeredObjectiveUnits',answered,'correctObjectiveUnits',correct,'unansweredObjectiveUnits',unanswered,'objectiveAccuracy',correct::numeric/nullif(answered,0),'eligibleClosedAssignments',eligible,'finalizedAttempts',finalized,'completionRate',finalized::numeric/nullif(eligible,0),'onTimeFinalizations',ontime,'topics',topics,'generatedAt',now());end$$;

create or replace function public.school_report(p jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$declare s uuid:=private.school();rows jsonb;begin p:=private.report_filters(p);perform private.require_access(s);if private.role()not in('teacher','administrator')then raise exception 'FORBIDDEN'using errcode='42501';end if;select coalesce(jsonb_agg(r),'[]')into rows from(select rr.student_id,e.subject,e.class_id,count(*)as published_assessments,sum(rr.total)as earned,sum(rr.maximum)as maximum,100.0*sum(rr.total)/nullif(sum(rr.maximum),0)as weighted_percentage,max(rr.published_at)as source_updated_at from public.results rr join public.exam_versions e on e.id=rr.version_id join public.classes c on c.id=e.class_id where rr.school_id=s and private.report_result(rr.version_id,rr.student_id)and(p->>'section'is null or c.section=p->>'section')and(p->>'classId'is null or e.class_id=(p->>'classId')::uuid)and(p->>'subject'is null or e.subject=p->>'subject')and(p->>'academicYear'is null or c.academic_year=p->>'academicYear')and(p->>'from'is null or rr.published_at>=(p->>'from')::timestamptz)and(p->>'to'is null or rr.published_at<(p->>'to')::timestamptz)group by rr.student_id,e.subject,e.class_id order by rr.student_id,e.subject limit least(coalesce((p->>'limit')::int,25),100)offset greatest(coalesce((p->>'offset')::int,0),0))r;return jsonb_build_object('rows',rows,'filters',p,'generatedAt',now());end$$;

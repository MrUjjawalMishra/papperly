-- Evidence is server-built from released, eligible snapshots only. No private
-- answers, keys, staff notes, names, login IDs or query conversations are input.
create function private.insight_evidence(u uuid,s uuid)returns jsonb language sql stable security definer set search_path='' as $$
 with allowed as(select 1 from public.memberships m join public.schools sc on sc.id=m.school_id where m.id=u and m.school_id=s and m.role='student'and m.active and sc.status='active'),rows as(select r.id,r.revision,r.total,r.maximum,(select jsonb_agg(sc||jsonb_build_object('unitCount',case q.type when 'match'then jsonb_array_length(q.content->'left')when 'blank'then jsonb_array_length(q.content->'blanks')else 1 end)order by q.position)
 from jsonb_array_elements(r.scores)sc join public.exam_questions q on q.id=(sc->>'questionId')::uuid and q.version_id=r.version_id)as scores,r.published_at,e.class_id,e.subject
 from public.results r join public.exam_versions e on e.id=r.version_id join public.exam_recipients er on er.version_id=e.id and er.student_id=r.student_id
 where exists(select 1 from allowed)and r.student_id=u and r.school_id=s and e.school_id=s and e.status='published'and not er.exempt
 order by r.published_at desc,r.id limit 200),payload as(select jsonb_build_object(
 'results',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'total',total,'maximum',maximum,'percentage',100.0*total/nullif(maximum,0),'scores',scores,'publishedAt',published_at,'classId',class_id,'subject',subject)order by published_at,id)from rows),'[]'),
 'period',jsonb_build_object('from',(select min(published_at)from rows),'to',(select max(published_at)from rows)),
  'resources',coalesce((select jsonb_agg(x)from(select a.id,a.filename as title,g.subject,'private-attachment'::text as kind
 from public.attachments a join public.posts po on po.id=a.post_id and po.school_id=a.school_id join public.groups g on g.id=po.group_id and g.school_id=a.school_id
 join public.group_memberships gm on gm.group_id=g.id and gm.student_id=u and gm.state='active'
 where exists(select 1 from allowed)and a.school_id=s and a.state='clean'and not po.deleted and not g.archived order by a.id limit 100)x),'[]'),'comparisonNote','Compare like class and subject; assessment difficulty can differ.',
 'evidenceLimit',200)as data)
 select data||jsonb_build_object('fingerprint',md5(data::text))from payload
 $$;
revoke execute on function private.insight_evidence(uuid,uuid)from public,anon,authenticated;

create function private.bump_insight(u uuid,s uuid)returns void language plpgsql security definer set search_path='' as $$declare v bigint;begin
 perform 1 from public.memberships where id=u for update;
 insert into private.insight_revisions(student_id,source_version,snapshot)select student_id,source_version,to_jsonb(i)from public.student_insights i where student_id=u;
 insert into public.student_insights(student_id,school_id)values(u,s)on conflict(student_id)do update set source_version=student_insights.source_version+1,status='updating',content=null,evidence=null,updated_at=clock_timestamp()returning source_version into v;
 insert into public.outbox(school_id,kind,dedup_key,payload)values(s,'insight','insight:'||u||':'||v,jsonb_build_object('studentId',u,'sourceVersion',v))on conflict do nothing;
end$$;
revoke execute on function private.bump_insight(uuid,uuid)from public,anon,authenticated;
create or replace function private.invalidate_insight()returns trigger language plpgsql security definer set search_path='' as $$begin
 perform private.bump_insight(coalesce(new.student_id,old.student_id),coalesce(new.school_id,old.school_id));return coalesce(new,old);
end$$;
drop trigger result_invalidation on public.results;
create trigger result_invalidation after insert or update or delete on public.results for each row execute function private.invalidate_insight();
create function private.insight_eligibility_changed()returns trigger language plpgsql security definer set search_path='' as $$declare r record;begin
 if tg_table_name='exam_versions'then
 if new.status is distinct from old.status then for r in select student_id,school_id from public.results where version_id=new.id loop perform private.bump_insight(r.student_id,r.school_id);end loop;end if;
 elsif new.exempt is distinct from old.exempt then perform private.bump_insight(new.student_id,new.school_id);end if;
 return new;
end$$;
revoke execute on function private.insight_eligibility_changed()from public,anon,authenticated;
create trigger insight_exam_eligibility after update of status on public.exam_versions for each row execute function private.insight_eligibility_changed();
create trigger insight_recipient_eligibility after update of exempt on public.exam_recipients for each row execute function private.insight_eligibility_changed();
create or replace function public.runtime_claim(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare j public.outbox;data jsonb;begin update public.outbox set run_token=gen_random_uuid(),status='processing',attempts=attempts+1,lease_until=now()+interval '2 minutes' where id=(p->>'id')::uuid and(status in ('pending','dispatched')or status='processing' and lease_until<now())and attempts<4 returning * into j;if not found then return null;end if;if not exists(select 1 from public.schools where id=j.school_id and status='active')then update public.outbox set status='unavailable',error_code='SCHOOL_INACTIVE',lease_until=null where id=j.id;return null;end if;
if j.kind='subjective' then select jsonb_build_object('question',q.content,'key',k.key,'response',a.response)into data from public.exam_questions q join private.question_keys k on k.version_id=q.version_id and k.question_id=q.id join public.attempts at on at.version_id=q.version_id left join public.answers a on a.attempt_id=at.id and a.question_id=q.id where at.id=(j.payload->>'attemptId')::uuid and q.id=(j.payload->>'questionId')::uuid;
elsif j.kind='insight' then
 select private.insight_evidence(i.student_id,i.school_id)||jsonb_build_object('sourceVersion',i.source_version,'correction',i.correction,'suppressed',i.suppressed)into data from public.student_insights i where i.student_id=(j.payload->>'studentId')::uuid and i.school_id=j.school_id;
 if data is null or not(j.payload?'sourceVersion')or(data->>'sourceVersion')::bigint<>(j.payload->>'sourceVersion')::bigint then update public.outbox set status='done',error_code='OBSOLETE_EVIDENCE',lease_until=null where id=j.id;return null;end if;
 end if;
return jsonb_build_object('id',j.id,'runToken',j.run_token,'kind',j.kind,'schoolId',j.school_id,'payload',j.payload,'data',data,'attempts',j.attempts);end$$;
create or replace function public.runtime_finish(p jsonb) returns void language plpgsql security definer set search_path='' as $$declare j public.outbox;begin select * into j from public.outbox where id=(p->>'id')::uuid for update;if j.status<>'processing' or j.run_token is distinct from (p->>'runToken')::uuid then return;end if;if p->>'status'='done' and j.kind='subjective' then update private.grades set ai_suggestion=p->'result' where attempt_id=(j.payload->>'attemptId')::uuid and question_id=(j.payload->>'questionId')::uuid and reviewer is null;elsif p->>'status'='done' and j.kind='insight' then update public.student_insights set content=p->'result',status='ready',evidence=private.insight_evidence(student_id,school_id),model=p->>'model',prompt_version=p->>'promptVersion',updated_at=clock_timestamp() where student_id=(j.payload->>'studentId')::uuid and source_version=(p->>'sourceVersion')::bigint and not suppressed and correction is null and p->>'evidenceFingerprint'=private.insight_evidence(student_id,school_id)->>'fingerprint';elsif j.kind='insight' and p->>'status' in ('failed','unavailable') then update public.student_insights set status=case when p->>'errorCode'='INSUFFICIENT_EVIDENCE'then 'insufficient-evidence'else p->>'status'end where student_id=(j.payload->>'studentId')::uuid and source_version=(p->>'sourceVersion')::bigint;end if;
update public.outbox set status=p->>'status',result=case when p->>'status'='done' then p->'result'else null end,error_code=p->>'errorCode',lease_until=null,available_at=now()+interval '30 seconds'where id=j.id;end$$;
create or replace function public.publish_result(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare a public.attempts;r public.results;t int;m int;sc jsonb;begin select * into a from public.attempts where id=(p->>'attemptId')::uuid for update;if not private.exam_teacher(a.version_id) or a.status='in_progress' then raise exception 'FORBIDDEN' using errcode='42501';end if;if exists(select 1 from private.grades where attempt_id=a.id and final_score is null) then raise exception 'UNREVIEWED';end if;select sum(g.final_score),sum(q.maximum),jsonb_agg(jsonb_build_object('questionId',q.id,'score',g.final_score,'maximum',q.maximum,'feedback',g.feedback,'topic',q.content->'primaryTopic'))into t,m,sc from private.grades g join public.exam_questions q on q.version_id=a.version_id and q.id=g.question_id where g.attempt_id=a.id;
insert into public.results(school_id,attempt_id,student_id,version_id,total,maximum,scores)values(a.school_id,a.id,a.student_id,a.version_id,t,m,sc)on conflict(attempt_id)do update set total=excluded.total,maximum=excluded.maximum,scores=excluded.scores,revision=results.revision+1,published_at=now()returning * into r;insert into private.result_revisions(result_id,revision,snapshot)values(r.id,r.revision,to_jsonb(r));insert into public.notifications(school_id,recipient_id,event_key,type,resource_id)values(a.school_id,a.student_id,'result:'||r.id||':'||r.revision,'result.published',r.id);perform private.audit(a.school_id,'result.published',r.id,p->>'reason');return r.id;end$$;

-- Revoked or changed resources immediately remove the old visible guidance.
create function private.insight_resource_changed()returns trigger language plpgsql security definer set search_path='' as $$declare gid uuid;r record;begin
 if tg_table_name='group_memberships'then
 if exists(select 1 from public.student_insights where student_id=coalesce(new.student_id,old.student_id))then perform private.bump_insight(coalesce(new.student_id,old.student_id),coalesce(new.school_id,old.school_id));end if;
 else
 if tg_table_name='groups'then gid:=coalesce(new.id,old.id);
 elsif tg_table_name='posts'then gid:=coalesce(new.group_id,old.group_id);
 else select group_id into gid from public.posts where id=coalesce(new.post_id,old.post_id);end if;
 for r in select gm.student_id,gm.school_id from public.group_memberships gm join public.student_insights i on i.student_id=gm.student_id where gm.group_id=gid and gm.state='active'order by gm.student_id loop perform private.bump_insight(r.student_id,r.school_id);end loop;
 end if;return coalesce(new,old);
end$$;
revoke execute on function private.insight_resource_changed()from public,anon,authenticated;
create trigger insight_membership_resource after insert or update or delete on public.group_memberships for each row execute function private.insight_resource_changed();
create trigger insight_attachment_resource after insert or update or delete on public.attachments for each row execute function private.insight_resource_changed();
create trigger insight_post_resource after update or delete on public.posts for each row execute function private.insight_resource_changed();
create trigger insight_group_resource after update or delete on public.groups for each row execute function private.insight_resource_changed();

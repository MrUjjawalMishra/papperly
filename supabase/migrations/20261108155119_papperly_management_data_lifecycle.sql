alter table public.enrollments add column revision int not null default 1;
alter table public.memberships add column profile_revision int not null default 1;

create function public.student_roster(p jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s uuid:=private.school();rows jsonb;begin
 perform private.require_access(s);
 if private.role()not in('teacher','administrator')then raise exception 'FORBIDDEN'using errcode='42501';end if;
 select coalesce(jsonb_agg(x),'[]')into rows from(
 select sr.student_id as id,m.display_name as name,m.active,m.profile_revision as "profileRevision",sr.admission_number as "admissionNumber",l.display as "loginId",
 e.class_id as "classId",c.academic_year as "academicYear",c.name as "className",c.section,e.roll,e.active as "enrollmentActive",e.revision as "enrollmentRevision",count(*)over()as "totalRows"
 from public.student_registry sr join public.memberships m on m.id=sr.student_id
 left join public.enrollments e on e.student_id=sr.student_id left join public.classes c on c.id=e.class_id
 left join private.login_identifiers l on l.user_id=m.id and l.current
 where sr.school_id=s and private.student_access(sr.student_id)
 and(private.role()='administrator'or e.active and private.assigned(e.class_id))
 and(coalesce((p->>'includeInactive')::bool,false)or m.active)
 and(p->>'classId'is null or e.class_id=(p->>'classId')::uuid)
 and(p->>'academicYear'is null or c.academic_year=p->>'academicYear')
 and(p->>'q'is null or m.display_name ilike '%'||replace(replace(p->>'q','%','\%'),'_','\_')||'%')
 order by lower(m.display_name),m.id,e.class_id limit least(greatest(coalesce((p->>'limit')::int,25),1),100) offset greatest(coalesce((p->>'offset')::int,0),0))x;
 return rows;
end$$;
create or replace function public.edit_student(p jsonb)returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=(p->>'studentId')::uuid;begin
 if private.role()not in('teacher','administrator')or not private.student_access(u)or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'FORBIDDEN'using errcode='42501';end if;
 update public.memberships set display_name=p->>'name',profile_revision=profile_revision+1 where id=u and role='student'and school_id=private.school()and profile_revision=(p->>'revision')::int;
 if not found then raise exception 'STALE_REVISION';end if;
 perform private.audit(private.school(),'student.profile.changed',u,p->>'reason',jsonb_build_object('fields',jsonb_build_array('displayName')));
end$$;
create or replace function public.enroll_student(p jsonb)returns void language plpgsql security definer set search_path='' as $$
declare s uuid:=private.school();u uuid:=(p->>'studentId')::uuid;c uuid:=(p->>'classId')::uuid;e public.enrollments;begin
 perform private.require_access(s,true);
 if private.role()not in('teacher','administrator')or not private.assigned(c)or not exists(select 1 from public.student_registry where student_id=u and school_id=s)then raise exception 'FORBIDDEN'using errcode='42501';end if;
 perform 1 from public.memberships where id=u for update;
 select * into e from public.enrollments where class_id=c and student_id=u for update;
 if found then
 if e.active and e.roll=p->>'roll'then return;end if;
 if e.revision is distinct from(p->>'revision')::int or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'STALE_REVISION';end if;
 update public.enrollments set active=true,roll=p->>'roll',revision=revision+1 where class_id=c and student_id=u;
 else insert into public.enrollments(school_id,class_id,student_id,roll)values(s,c,u,p->>'roll');end if;
 perform private.audit(s,'student.enrolled',u,p->>'reason',jsonb_build_object('classId',c));
end$$;
create function public.move_student(p jsonb)returns void language plpgsql security definer set search_path='' as $$
declare s uuid:=private.school();u uuid:=(p->>'studentId')::uuid;from_class uuid:=(p->>'fromClassId')::uuid;to_class uuid:=(p->>'toClassId')::uuid;e public.enrollments;begin
 perform private.require_access(s,true);
 if private.role()not in('teacher','administrator')or from_class=to_class or not private.student_access(u)or not private.assigned(from_class)or not private.assigned(to_class)or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'FORBIDDEN'using errcode='42501';end if;
 perform 1 from public.memberships where id=u and school_id=s and role='student'for update;
 if not found then raise exception 'FORBIDDEN'using errcode='42501';end if;
 select * into e from public.enrollments where class_id=from_class and student_id=u and active for update;
 if not found or e.revision is distinct from(p->>'revision')::int then raise exception 'STALE_REVISION';end if;
 update public.enrollments set active=false,revision=revision+1 where class_id=from_class and student_id=u;
 insert into public.enrollments(school_id,class_id,student_id,roll)values(s,to_class,u,p->>'roll')on conflict(class_id,student_id)do update set roll=excluded.roll,active=true,revision=enrollments.revision+1;
 update public.group_memberships gm set state='removed',updated_at=now()from public.groups g where gm.group_id=g.id and gm.student_id=u and g.class_id=from_class and gm.state='active';
 perform private.audit(s,'student.class_moved',u,p->>'reason',jsonb_build_object('fromClassId',from_class,'toClassId',to_class));
end$$;
create function public.withdraw_enrollment(p jsonb)returns void language plpgsql security definer set search_path='' as $$
declare s uuid:=private.school();u uuid:=(p->>'studentId')::uuid;c uuid:=(p->>'classId')::uuid;begin
 perform private.require_access(s);
 if private.role()not in('teacher','administrator')or not private.assigned(c)or not private.student_access(u)or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'FORBIDDEN'using errcode='42501';end if;
 perform 1 from public.memberships where id=u and school_id=s for update;
 update public.enrollments set active=false,revision=revision+1 where school_id=s and student_id=u and class_id=c and revision=(p->>'revision')::int and active;
 if not found then raise exception 'STALE_REVISION';end if;
 update public.group_memberships gm set state='removed',updated_at=now()from public.groups g where gm.group_id=g.id and gm.student_id=u and g.class_id=c and gm.state='active';
 perform private.audit(s,'student.enrollment_withdrawn',u,p->>'reason',jsonb_build_object('classId',c));
end$$;
create function public.remove_assignment(p jsonb)returns void language plpgsql security definer set search_path='' as $$
declare s uuid:=private.school();u uuid:=(p->>'teacherId')::uuid;begin
 perform private.require_access(s);
 if private.role()<>'administrator'or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'FORBIDDEN'using errcode='42501';end if;
 perform 1 from public.memberships where id=u and school_id=s and role='teacher'for update;
 if not found then raise exception 'FORBIDDEN'using errcode='42501';end if;
 delete from public.teacher_assignments where school_id=s and teacher_id=u and class_id=(p->>'classId')::uuid and subject=p->>'subject';
 if found then perform private.audit(s,'teacher.unassigned',u,p->>'reason',jsonb_build_object('classId',p->>'classId','subject',p->>'subject'));end if;
end$$;
create function public.assigned_directory(p jsonb)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s uuid:=private.school();rows jsonb;begin
 perform private.learning_access();
 if private.role()not in('student','teacher','administrator')then raise exception 'FORBIDDEN'using errcode='42501';end if;
 select coalesce(jsonb_agg(x),'[]')into rows from(
 select a.teacher_id as id,m.display_name as "displayName",a.class_id as "classId",a.subject
 from public.teacher_assignments a join public.memberships m on m.id=a.teacher_id and m.active and m.role='teacher'
 where a.school_id=s and(p->>'classId'is null or a.class_id=(p->>'classId')::uuid)
 and(private.role()='administrator'or private.role()='teacher'and a.teacher_id=auth.uid()or private.role()='student'and exists(select 1 from public.enrollments where class_id=a.class_id and student_id=auth.uid()and active))
 order by lower(m.display_name),a.teacher_id,a.class_id,a.subject limit least(greatest(coalesce((p->>'limit')::int,25),1),100)offset greatest(coalesce((p->>'offset')::int,0),0))x;
 return rows;
end$$;
-- School-managed factual fields derive teaching subjects/classes from actual assignments.
create function private.profile_assignment_fields()returns trigger language plpgsql security definer set search_path='' as $$begin
 select coalesce(array_agg(distinct a.subject order by a.subject),'{}'),coalesce(array_agg(distinct(c.name||c.section)order by(c.name||c.section)),'{}')into new.subjects,new.classes
 from public.teacher_assignments a join public.classes c on c.id=a.class_id where a.teacher_id=new.teacher_id and a.school_id=new.school_id;
 return new;
end$$;
create trigger authoritative_assignment_fields before insert or update on public.teacher_profiles for each row execute function private.profile_assignment_fields();
create function private.refresh_assignment_profile()returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.teacher_profiles set revision=revision+1 where teacher_id=coalesce(new.teacher_id,old.teacher_id);return coalesce(new,old);
end$$;
create trigger authoritative_profile_refresh after insert or update or delete on public.teacher_assignments for each row execute function private.refresh_assignment_profile();
revoke execute on function private.profile_assignment_fields(),private.refresh_assignment_profile()from public,anon,authenticated;
create function public.update_profile_details(p jsonb)returns void language plpgsql security definer set search_path='' as $$
declare s uuid:=private.school();pr public.teacher_profiles;begin
 perform private.require_access(s,true);
 if private.role()<>'administrator'or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'FORBIDDEN'using errcode='42501';end if;
 select * into pr from public.teacher_profiles where id=(p->>'profileId')::uuid and school_id=s for update;
 if not found then raise exception 'FORBIDDEN'using errcode='42501';end if;
 if pr.revision is distinct from(p->>'revision')::int then raise exception 'STALE_REVISION';end if;
 update public.teacher_profiles set display_name=p->>'displayName',designation=p->>'designation',approved_fields=approved_fields||jsonb_build_object('qualifications',p->>'qualifications','experience',p->>'experience'),revision=revision+1 where id=pr.id;
 perform private.audit(s,'profile.factual_details_changed',pr.id,p->>'reason',jsonb_build_object('fields',jsonb_build_array('displayName','designation','qualifications','experience')));
end$$;
revoke execute on function public.student_roster(jsonb),public.move_student(jsonb),public.withdraw_enrollment(jsonb),public.remove_assignment(jsonb),public.assigned_directory(jsonb),public.update_profile_details(jsonb)from public,anon;
grant execute on function public.student_roster(jsonb),public.move_student(jsonb),public.withdraw_enrollment(jsonb),public.remove_assignment(jsonb),public.assigned_directory(jsonb),public.update_profile_details(jsonb)to authenticated;

-- Approving a biography cannot overwrite school-verified qualifications.
create or replace function public.manage_profile(p jsonb)returns uuid language plpgsql security definer set search_path='' as $$declare s uuid:=private.school();pr public.teacher_profiles;rid uuid;begin perform private.require_access(s,true);if p->>'action'='create' then if private.role()<>'administrator'or not exists(select 1 from public.memberships where id=(p->>'teacherId')::uuid and school_id=s and role='teacher'and active)then raise exception 'FORBIDDEN'using errcode='42501';end if;insert into public.teacher_profiles(school_id,teacher_id,display_name,designation,subjects,classes)values(s,(p->>'teacherId')::uuid,p->>'displayName',coalesce(p->>'designation',''),array(select jsonb_array_elements_text(p->'subjects')),array(select jsonb_array_elements_text(p->'classes')))returning id into rid;else select * into pr from public.teacher_profiles where id=(p->>'profileId')::uuid and school_id=s for update;if not found then raise exception 'FORBIDDEN'using errcode='42501';end if;
if p->>'action'='draft' then if private.role()<>'teacher'or pr.teacher_id<>auth.uid()then raise exception 'FORBIDDEN'using errcode='42501';end if;insert into public.profile_revisions(school_id,profile_id,author_id,content,state)values(s,pr.id,auth.uid(),p->'content','submitted')returning id into rid;
elsif private.role()='administrator' then if p->>'action'='approve' then if p->>'audience'='public'and not exists(select 1 from public.schools where id=s and public_enabled)then raise exception 'PUBLIC_NOT_ENABLED';end if;update public.teacher_profiles set approved_fields=approved_fields||(select content-'qualifications'-'experience' from public.profile_revisions where id=(p->>'revisionId')::uuid and profile_id=pr.id and state='submitted'),visible=true,audience=p->>'audience',published_at=now(),revision=revision+1 where id=pr.id;update public.profile_revisions set state='approved'where id=(p->>'revisionId')::uuid and profile_id=pr.id;elsif p->>'action'='unpublish' then update public.teacher_profiles set visible=false,revision=revision+1 where id=pr.id;else raise exception 'INVALID_ACTION';end if;rid:=pr.id;else raise exception 'FORBIDDEN'using errcode='42501';end if;end if;perform private.audit(s,'profile.changed',rid,p->>'reason');return rid;end$$;
-- Management catalogs do not turn into unassigned-user directories.
drop policy read_scope on public.teacher_assignments;
create policy read_scope on public.teacher_assignments for select to authenticated using(school_id=private.school()and(
 private.role()='administrator'or private.role()='teacher'and teacher_id=auth.uid()or private.role()='student'and exists(select 1 from public.enrollments e where e.class_id=teacher_assignments.class_id and e.student_id=auth.uid()and e.active)));
drop policy read_scope on public.professional_updates;
create policy read_scope on public.professional_updates for select to authenticated using(
 approved and private.profile_visible(profile_id)or school_id=private.school()and(private.role()='administrator'or private.role()='teacher'and exists(select 1 from public.teacher_profiles pr where pr.id=profile_id and pr.teacher_id=auth.uid())));

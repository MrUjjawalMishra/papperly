from pathlib import Path
policies={
'schools':"id=private.school() and private.role() is not null or private.role()='owner'",
'subscriptions':"school_id=private.school() and private.role() in ('administrator','teacher') or private.role()='owner'",
'memberships':"private.role() is not null and (id=auth.uid() or school_id=private.school() and private.role()='administrator' or role='student' and private.student_access(id))",
'classes':"school_id=private.school() and private.role() is not null",
 'teacher_assignments':"school_id=private.school() and private.role() is not null",
'student_registry':"school_id=private.school() and private.role() is not null and (student_id=auth.uid() or private.student_access(student_id))",
'enrollments':"school_id=private.school() and private.role() is not null and (student_id=auth.uid() or private.assigned(class_id))",
'audit_events':"school_id=private.school() and (private.role()='administrator' or actor_id=auth.uid() or subject_id=auth.uid() and action like 'account.%')",
'import_jobs':"school_id=private.school() and (actor_id=auth.uid() or private.role()='administrator')",
'import_rows':"exists(select 1 from public.import_jobs j where j.id=job_id)",
'outbox':'false',
'notifications':"recipient_id=auth.uid() and school_id=private.school() and private.role() is not null",
'question_drafts':"author_id=auth.uid() and school_id=private.school() and private.role()='teacher'",
'exam_versions':"private.can_exam(id) or school_id=private.school() and private.role()='administrator'",
'exam_questions':"private.can_exam(version_id)",
'exam_recipients':"school_id=private.school() and (student_id=auth.uid() and private.role()='student' or private.exam_teacher(version_id))",
'attempts':"school_id=private.school() and (student_id=auth.uid() and private.role()='student' or private.exam_teacher(version_id))",
'answers':"exists(select 1 from public.attempts a where a.id=attempt_id and (a.student_id=auth.uid() or private.exam_teacher(a.version_id)))",
'results':"school_id=private.school() and private.report_result(version_id,student_id)",
'integrity_events':"exists(select 1 from public.attempts a where a.id=attempt_id and (a.student_id=auth.uid() and private.role()='student' or private.exam_teacher(a.version_id)))",
'integrity_reviews':"exists(select 1 from public.attempts a where a.id=attempt_id and (a.student_id=auth.uid() and private.role()='student' or private.exam_teacher(a.version_id) or private.role()='administrator' and a.school_id=private.school()))",
'groups':"private.can_group(id) or school_id=private.school() and private.role()='administrator'",
'group_memberships':"school_id=private.school() and not private.active_attempt() and (student_id=auth.uid() and private.role()='student' or private.group_teacher(group_id))",
'posts':"not deleted and private.can_group(group_id)",
'post_reads':"student_id=auth.uid() and private.role()='student' and exists(select 1 from public.posts where id=post_id)",
'query_policies':"school_id=private.school() and private.role() is not null and not private.active_attempt()",
'queries':"private.can_query(id) or school_id=private.school() and private.role()='administrator'",
'query_cycles':"exists(select 1 from public.queries q where q.id=query_id)",
'query_messages':"private.can_query(query_id)",
'deadline_revisions':"exists(select 1 from public.queries q where q.id=query_id)",
'attachments':"state='clean' and ((post_id is not null and exists(select 1 from public.posts p where p.id=post_id)) or (query_message_id is not null and exists(select 1 from public.query_messages m where m.id=query_message_id)))",
'student_insights':"school_id=private.school() and not private.active_attempt() and (student_id=auth.uid() and private.role()='student' or private.role()='administrator')",
 'teacher_feedback':"school_id=private.school() and not private.active_attempt() and (student_id=auth.uid() or private.assigned(class_id,subject))",
'report_exports':"school_id=private.school() and actor_id=auth.uid() and private.role() in ('teacher','administrator') and expires_at>now()",
 'teacher_profiles':"private.profile_visible(id) or school_id=private.school() and (teacher_id=auth.uid() and private.role()='teacher' or private.role()='administrator')",
'profile_revisions':"school_id=private.school() and (author_id=auth.uid() and private.role()='teacher' or private.role()='administrator')",
'professional_updates':"approved and private.profile_visible(profile_id)",
 'teacher_articles':"published_revision is not null and not archived and private.profile_visible(profile_id) and (school_id=private.school() or audience='public' and exists(select 1 from public.schools where id=school_id and public_enabled)) or school_id=private.school() and (author_id=auth.uid() and private.role()='teacher' or private.role()='administrator')",
 'article_revisions':"exists(select 1 from public.teacher_articles a where a.id=article_id and (a.published_revision=article_revisions.id or a.school_id=private.school() and (a.author_id=auth.uid() and private.role()='teacher' or private.role()='administrator')))",
 'content_publications':'false','public_assets':'false'}
s='-- Generated explicit read policies; no client table writes.\n'
for t,cond in policies.items():
 s+=f'alter table public.{t} enable row level security;\ncreate policy read_scope on public.{t} for select to authenticated using ({cond});\n'
s+='grant usage on schema private to authenticated;\n'
s+='revoke all on all tables in schema public from anon, authenticated;\ngrant select on '+','.join('public.'+t for t in policies)+' to authenticated;\n'
s+='revoke execute on all functions in schema private from public, anon, authenticated;\n'
helpers=['me()','school()','role()','staff(uuid)','assigned(uuid,text)','student_access(uuid)','active_attempt()','exam_teacher(uuid)','can_exam(uuid)','group_teacher(uuid)','can_group(uuid)','can_query(uuid)','profile_visible(uuid)','report_result(uuid,uuid)']
s+='grant execute on function '+','.join('private.'+h for h in helpers)+' to authenticated;\n'
s+='revoke execute on all functions in schema public from public, anon, authenticated;\n'
# Exposed RPCs only. Additional service functions are explicitly service-only.
rpcs=['create_class','assign_teacher','publish_exam','start_attempt','save_answer','submit_attempt','review_grade','review_details','publish_result','create_group','set_group_member','write_post','set_query_policy','create_query','reply_query','transition_query','revise_deadline','write_article','moderate_article','directory','student_progress']
s+='grant execute on function '+','.join('public.'+r+'(jsonb)' for r in rpcs)+' to authenticated;\ngrant execute on function public.directory(jsonb) to anon;\n'
s+='grant all on all tables in schema public to service_role;\ngrant usage on schema private to service_role;\ngrant all on all tables in schema private to service_role;\ngrant usage, select on all sequences in schema public,private to service_role;\n'
migration_paths=list(Path('supabase/migrations').glob('*_rls.sql'))
if len(migration_paths)!=1: raise RuntimeError('Expected one canonical RLS migration')
migration_paths[0].write_text(s)

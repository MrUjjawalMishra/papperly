-- The existing subscription row lock serializes quota and idempotency checks.
-- Requests store metadata/checksums, never file bytes or reusable credentials.
create table private.upload_requests(
 school_id uuid not null references public.schools(id),uploader_id uuid not null,
 request_key text not null check(length(request_key)between 8 and 128),
 attachment_id uuid not null,request jsonb not null,created_at timestamptz not null default now(),
 primary key(school_id,uploader_id,request_key),
 foreign key(school_id,uploader_id)references public.memberships(school_id,id),
 foreign key(attachment_id)references public.attachments(id));
create index upload_request_attachment on private.upload_requests(attachment_id);
alter table private.upload_requests enable row level security;
revoke all on private.upload_requests from public,anon,authenticated;
create or replace function public.reserve_upload(p jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare s uuid:=private.school();pid uuid:=(p->>'postId')::uuid;mid uuid:=(p->>'messageId')::uuid;cap bigint;used bigint;n int;a public.attachments;k text;expected jsonb;prior private.upload_requests;begin perform private.require_access(s,true);perform private.learning_access();if num_nonnulls(pid,mid)<>1 then raise exception 'INVALID_PARENT';end if;if pid is not null and not exists(select 1 from public.posts where id=pid and private.group_teacher(group_id)and not deleted)then raise exception 'FORBIDDEN'using errcode='42501';end if;if mid is not null and not exists(select 1 from public.query_messages where id=mid and author_id=auth.uid()and private.can_query(query_id))then raise exception 'FORBIDDEN'using errcode='42501';end if;select storage_limit into cap from public.subscriptions where school_id=s for update;expected:=jsonb_build_object('postId',pid,'messageId',mid,'filename',p->>'filename','type',p->>'type','size',(p->>'size')::bigint,'checksum',p->>'checksum');
 k:=coalesce(p->>'idempotencyKey','auto:'||md5(expected::text));
 if k!~'^[A-Za-z0-9._:-]{8,128}$'then raise exception 'INVALID_IDEMPOTENCY_KEY';end if;
 select * into prior from private.upload_requests where school_id=s and uploader_id=auth.uid()and request_key=k;
 if found then
 if prior.request is distinct from expected then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 select * into a from public.attachments where id=prior.attachment_id and school_id=s;
 if not found or a.state='deleted'then raise exception 'UPLOAD_RETIRED';end if;
 return jsonb_build_object('id',a.id,'objectKey',a.object_key,'state',a.state,'requiresUpload',a.state='quarantined'and not exists(select 1 from public.outbox where kind='scan'and payload->>'attachmentId'=a.id::text));
 end if;
 select coalesce(sum(size),0)into used from public.attachments where school_id=s and charged and state<>'deleted';if used+(p->>'size')::bigint>cap then raise exception 'STORAGE_QUOTA_EXCEEDED';end if;select count(*)into n from public.attachments where(post_id=pid or query_message_id=mid)and state<>'deleted';if n>=5 then raise exception 'MAXIMUM_FIVE_FILES';end if;insert into public.attachments(school_id,uploader_id,post_id,query_message_id,object_key,filename,declared_type,detected_type,size,checksum,charged)values(s,auth.uid(),pid,mid,s||'/'||gen_random_uuid(),p->>'filename',p->>'type',p->>'type',(p->>'size')::bigint,p->>'checksum',true)returning * into a;insert into private.upload_requests(school_id,uploader_id,request_key,attachment_id,request)values(s,auth.uid(),k,a.id,expected);perform private.audit(s,'file.reserved',a.id);return jsonb_build_object('id',a.id,'objectKey',a.object_key,'state',a.state,'requiresUpload',true);end$$;

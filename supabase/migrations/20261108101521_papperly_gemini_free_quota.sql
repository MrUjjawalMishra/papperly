-- Conservative application cap; the configured Google project must separately
-- be confirmed free/unbilled. No model, billing or paid fallback is enabled.
create table private.ai_provider_usage(day date primary key,calls int not null default 0 check(calls between 0 and 20));
create table private.ai_provider_calls(run_token uuid primary key,job_id uuid not null references public.outbox(id)on delete cascade,day date not null,admitted boolean not null default false);
alter table private.ai_provider_usage enable row level security;
alter table private.ai_provider_calls enable row level security;
create function public.runtime_reserve_provider_call(p jsonb)returns boolean language plpgsql security definer set search_path='' as $$
declare j public.outbox;d date:=(now()at time zone'UTC')::date;inserted int;admitted boolean:=false;begin
 select * into j from public.outbox where id=(p->>'id')::uuid and run_token=(p->>'runToken')::uuid and status='processing' and lease_until>now() and kind in('format','subjective','insight') for update;
 if not found or not exists(select 1 from public.schools where id=j.school_id and status='active')then return false;end if;
 insert into private.ai_provider_calls(run_token,job_id,day)values(j.run_token,j.id,d)on conflict do nothing;get diagnostics inserted=row_count;
 if inserted=0 then return false;end if;
 insert into private.ai_provider_usage(day,calls)values(d,0)on conflict do nothing;
 update private.ai_provider_usage set calls=calls+1 where day=d and calls<20 returning true into admitted;
 if coalesce(admitted,false)then update private.ai_provider_calls set admitted=true where run_token=j.run_token;return true;end if;
 return false;
end$$;
revoke execute on function public.runtime_reserve_provider_call(jsonb)from public,anon,authenticated;
grant execute on function public.runtime_reserve_provider_call(jsonb)to service_role;

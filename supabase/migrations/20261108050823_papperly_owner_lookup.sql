-- The singleton owner is created only by restricted server-side bootstrap.
-- A pinned OWNER_USER_ID remains supported; omitting it resolves that singleton.
-- No user-provided owner ID is accepted by the HTTP login adapter.
-- Keep historical owner memberships for append-only audit attribution while
-- allowing restricted bootstrap after an earlier owner has been deactivated.
create unique index one_active_owner on public.memberships(role)
  where role='owner' and active;
drop index public.one_owner;
create or replace function public.runtime_owner_lookup(p jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'credentialVersion',credential_version,
   'role',role,'policy',credential_policy)
 from public.memberships
 where role='owner' and active
   and (nullif(p->>'userId','') is null or id=(p->>'userId')::uuid)
$$;
revoke execute on function public.runtime_owner_lookup(jsonb) from public,anon,authenticated;
grant execute on function public.runtime_owner_lookup(jsonb) to service_role;

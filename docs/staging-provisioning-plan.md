# Staging provisioning plan — pending resource approval

Verified account: `e746f9041a0f5eddfd51c206531b3393`. Existing secure GitHub credential environment: `Cloudflare` (ID `26576187709`). Supabase staging project: `soudjtewvquywncqtwyo`; its 22 migrations are already applied. Production is excluded.

## Proposed resources

| Resource  | Exact name                 | Intended configuration                                                                |
| --------- | -------------------------- | ------------------------------------------------------------------------------------- |
| Worker    | `papperly-api-staging`     | API, queue consumer and scheduled handler in the existing Worker package; no frontend |
| R2 bucket | `papperly-staging-private` | Private; no public domain or public development URL; authorized Worker access only    |
| Queue     | `papperly-staging-jobs`    | Durable background delivery with application deduplication                            |

Recheck exact names with pagination before creating anything; reuse matching resources only after inspecting their configuration. The successful read-only probe returned no matching candidates. This is not proof of write permission, a billing-plan check or a complete resource inventory. Do not create duplicate resources on retry.

No resource creation or paid-plan change is authorized yet. Ask for staging usage-billed resource approval before mutation; do not silently upgrade the account plan. Cloudflare currently documents Workers Free allowances and Workers Paid starting at $5/month plus overages, Queues Free allowances with metered paid operations, and R2 Standard storage at $0.015/GB-month with request charges beyond free allowances. These are provider rates, not a quote or spending cap. Account-wide usage, retries and logs can affect cost. Verify actual plan and limits before choosing deployment settings. Do not promise a hard cost cap without a provider-enforced limit.

Official pricing checked 2026-11-07:

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/queues/platform/pricing/

## Secure configuration still needed

The existing Cloudflare account ID/token already work for read access. Do not recreate them. In the existing GitHub `Cloudflare` environment, save the Supabase staging server key as secret `SUPABASE_SERVICE_ROLE_KEY`, never chat or source. This runtime name is defined in `.env.example`; the release workflow still needs a secure Wrangler secret-upload step before it can consume it. Use the current implementation's environment template and deployment workflow to determine the exact runtime variable names before release; a Supabase project publishable key cannot replace its server secret. Generate the session encryption key within the authorized deployment environment without logging it. Confirm the staging alias domain, allowed HTTPS origins and initial owner bootstrap before provisioning real accounts.

The current staging release workflow is still bound to GitHub environment `staging`; align it with the reviewed credential environment and all required runtime secrets before enabling releases. Preserve its test gates, target guard and serialized migrations. No staging branch release, production promotion or deployment URL is claimed here.

## Release and verification

After resource approval and runtime configuration: inspect provider resources, verify write operations within this account, configure private bindings, validate the exact commit, review migration history, deploy through one CI run, poll to terminal completion and verify health/readiness/release SHA. Follow with real Auth, role isolation, synthetic exam, private file, queue and scheduled-workflow checks. Record the actual deployment ID/URL and migration state. AI/scanner remain fail-closed unless separately configured and verified. The complete Version 1 acceptance gaps in backend-requirements.md remain work, not deployment prerequisites that can be waived by a green connection check.

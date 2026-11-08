# Historical server-secret correction — resolved

Resolved on 2026-11-08: the server Secret key now verifies and staging is deployed. Do not replace the currently working key to repeat these historical steps. See staging-release-evidence.json.

The Cloudflare environment already contains `SUPABASE_SERVICE_ROLE_KEY`, but run 42444357894 identified its value as a publishable key. The preceding server-only RPC returned HTTP 401. Do not change the working Cloudflare token/account ID, share keys in chat or recreate the bucket/Queue.

1. Open the user-confirmed staging project: https://supabase.com/dashboard/project/soudjtewvquywncqtwyo . Verify the project is Papperly and its reference is exactly `soudjtewvquywncqtwyo`.
2. Open **Settings → API Keys**. Copy a server **Secret key** (`sb_secret_…`). The legacy **service_role** key is also supported. A **Publishable** (`sb_publishable_…`) or legacy **anon** key cannot serve this purpose. Do not copy a key ID/name instead of the value.
3. Open https://github.com/MrUjjawalMishra/papperly/settings/environments/26576187709/edit . Confirm the environment is **Cloudflare**. Under **Environment secrets**, edit `SUPABASE_SERVICE_ROLE_KEY`, replace its value and save. Never place it under Variables or in source.
4. Reply **saved**. The agent can rerun the failed deployment job through GitHub MCP at the same already-validated commit. Existing private R2/Queue resources are reused. No terminal is required and the agent does not need to read the value.

After a successful retry, the agent must inspect workflow/provider completion, verify the release identity and readiness, and record the actual URL/deployment ID. A successful connection or resource-creation check is not an application deployment. Auth bootstrap, live role/exam/file/Queue/scheduled flows, selected external providers and the full Version 1 acceptance suite remain separate verification work.

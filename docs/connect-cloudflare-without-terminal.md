# Connect Cloudflare using browser-only setup

ChatGPT Apps/Developer Mode is not required for this route. GitHub and Supabase are already connected. GitHub Actions will make Cloudflare API calls; the assistant uses GitHub MCP to start the connection check through a dedicated branch and inspect its result. This is an authorized API/CI fallback, not a Cloudflare MCP connection.

## 1. Open the existing GitHub credential environment

Open https://github.com/MrUjjawalMishra/papperly/settings/environments . For this project, open the existing environment named `Cloudflare` (ID 26576187709). It contains the credentials supplied by the user. The application target is still staging; the GitHub credential environment has a different label. You do not need a terminal.

Keep deployment credentials in this environment, not in source or pull-request code. Do not enable ENABLE_STAGING_AUTODEPLOY yet. The deployment target/budget/runtime configuration and remaining acceptance work are not complete.

## 2. Find the Cloudflare account ID

Sign in at https://dash.cloudflare.com/ and select the account intended for Papperly staging. Use the dashboard's Account ID/Copy account ID control. It is a 32-character identifier, not an API token. Do not copy a Zone ID.

In GitHub's `Cloudflare` environment, under Environment variables, choose Add environment variable:

- Name: `CLOUDFLARE_ACCOUNT_ID`
- Value: that account ID.

## 3. Create a scoped Cloudflare token

Open https://dash.cloudflare.com/profile/api-tokens . Choose Create Token, then the custom-token option. Suggested name: `Papperly staging deployment`.

Grant these account permissions:

| Account permission | Access |
| ------------------ | ------ |
| Account Settings   | Read   |
| Workers Scripts    | Edit   |
| Workers R2 Storage | Edit   |
| Queues             | Edit   |

Restrict Account Resources to Include / the specific account chosen above. Do not choose every account, add DNS/billing permissions, or use the Global API Key. Cloudflare's UI may display the permission groups with slightly different wording; the required operations are Worker scripts, R2 and Queues management plus account metadata read. Cloudflare documents Edit as CRUD/list access.

For GitHub-hosted runners, do not add a client IP restriction unless you have configured known fixed runner egress; arbitrary restrictions will block the workflow. A token expiration is supported; record it so CI can be rotated before expiry.

Review the scope, create the token, and copy it once.

## 4. Store the token as a GitHub environment secret

Return to the `Cloudflare` environment in GitHub. Under Environment secrets, choose Add environment secret:

- Name: `CLOUDFLARE_API_TOKEN`
- Value: the token copied from Cloudflare.

Do not paste it into this chat, a GitHub issue, repository file, environment variable, or workflow YAML. GitHub stores it encrypted; the assistant does not need to read it back.

## 5. Reply in chat

Say: `Cloudflare staging variable and secret saved.`

The assistant will create/update the dedicated `ops/cloudflare-connection` branch from the tested code, which triggers Cloudflare connection check. The workflow can also be run manually from GitHub Actions because workflow_dispatch is supported. It reads the account and lists matching staging Worker/bucket/queue candidates using GET only. It does not deploy, create resources, change billing, or modify Supabase. Its artifact/log output excludes the token and unrelated resource names.

The check is source-implemented and locally tested, but not live-verified until the credentials are configured and its run passes. It verifies read access, not all deployment permissions. Missing Workers subdomain is reported as null, not silently invented. Product/billing availability, existing resource identity and any paid creation require review before deployment.

After this check, remaining runtime secrets (including the server-side Supabase key), Auth/owner setup, permitted origins, resource bindings and full Version 1 acceptance still need completion. The assistant will give exact next steps based on the verified account; it will not request passwords/tokens in chat.

Official sources checked: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/ ; https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ ; https://developers.cloudflare.com/api/resources/accounts/methods/get/ . Additional connectors may be available at https://chatgpt.com/plugins , but none for Cloudflare was returned by this session's search.

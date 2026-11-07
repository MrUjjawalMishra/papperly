# Papperly — Version 1 backend

Backend-only TypeScript/Cloudflare Worker monorepo with Supabase PostgreSQL migrations, private R2/Queues adapters, synthetic fixtures, API contracts and automated local tests. **Version 1 acceptance is not complete. Supabase staging schema is applied and database boundaries have live verification; no Cloudflare application is deployed.** See docs/backend-status.md and docs/backend-requirements.md for exact scope and gaps.

Requires Node 24 and npm. From repository root:

```sh
npm ci
npm run verify
npm run format:check
node scripts/scan-secrets.mjs
```

`npm test` starts embedded PostgreSQL engines and tests ordinary authenticated roles (including forbidden paths across two schools). It does not need provider credentials and does not prove native concurrent-connection behavior or live Supabase Auth. `npm run build` bundles the staging Worker with Wrangler `--dry-run`, without creating resources or deploying.

Local Worker:

```sh
npx wrangler dev --local --config apps/api/wrangler.jsonc --env staging
```

Use environment-specific secret settings for .env.example names. Do not copy secrets into source, chat, Git, fixture SQL or logs. `/healthz` works without external services; `/readyz` fails closed without database/bindings/session configuration. Apply migrations only to a verified new Papperly development/staging project after reading docs/deployment.md. supabase/seed.sql is fictional development data, creates no Auth passwords, and must not be applied to real school data.

Read docs/PRD.md (verbatim), docs/architecture.md, docs/decisions.md, docs/api.md, docs/openapi.json, docs/requests.http, docs/frontend-handoff.md, docs/deployment.md and docs/verification.md. No frontend application is included. No production promotion is authorized.

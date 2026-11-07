# Verification evidence

2026-11-07. Evidence is local unless stated otherwise. No live release exists.

Automated test suites cover domain scoring/validation, ordinary authenticated database roles and forbidden direct writes, cross-school roster/results access, protected-key/service-RPC denial, publication/recipient restrictions, resume/answer revisions/writer conflicts, idempotent finalization, request-time expiry and lost dispatch recovery, registry reservations/reuse/conflicts/activation retries, XLSX/template/type validation, pending/removed group access and blocked student posting, private query replies/deadline history/reopen cycles, article approval/draft visibility, published grade snapshots/overrides/stale insight results, operational support scope, HTTP secure cookies/Origin/CSRF/logout, and clean replay of synthetic two-school seeds. Exact final totals are recorded in backend-status.md.

Database tests use PGlite PostgreSQL/WASM. They execute SET ROLE authenticated and auth.uid() claims, not privileged-only happy paths. The test auth.uid() function is an explicit test bootstrap, not a replacement production Auth server. HTTP tests use mocked Auth/PostgREST backed by the same engine. No live provider responses are fabricated.

`docs/local-worker-smoke.json`: actual Wrangler/workerd HTTP requests returned health 200, unconfigured readiness 503, unauthenticated results 401. This proves local routing/fail-closed behavior, not staged integration.

`docs/local-load-evidence.json`: 50 synthetic students in two schools, queued save+submit paths, 100 durable background jobs, zero observed failures in the recorded run. Combined queued workflow p95 ~917 ms, total ~974 ms. One serialized embedded connection, no HTTP/provider latency and no concurrent native database sessions. AI/scanning/import/report mixed background workload was not executed. The PRD under-two-second answer-save/submission pilot target is **not passed**.

Wrangler `deploy --dry-run` successfully bundles the Worker. It does not establish that Cloudflare buckets/queues exist or that credentials, cron, deployment or R2 scanning work. Supabase Auth, managed-instance RLS, native transaction races, provider retries, real 50-student mixed-load network latency, backup restoration and post-deployment full smoke remain unverified.

The source includes formatting/lint/type/test/build/frontend-absence/secret-pattern gates and GitHub Actions with a gitleaks gate. Docker gitleaks execution and GitHub CI outcomes must be reported separately from the local pattern scan. No skipped test is counted as passed.

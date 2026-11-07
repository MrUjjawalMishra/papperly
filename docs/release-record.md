# Current staging database release record — 2026-11-07

Papperly's database schema is applied to the user-confirmed Supabase staging project. The Cloudflare application is not deployed, and full Version 1 acceptance remains incomplete.

| Field                                   | Verified value                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Supabase project                        | Papperly / soudjtewvquywncqtwyo                                                                                           |
| Organization                            | Ujjawal Mishra / llccfqasogvlphhwgnvn                                                                                     |
| Region / database                       | ap-northeast-1 / PostgreSQL 17.11                                                                                         |
| Database API URL                        | https://soudjtewvquywncqtwyo.supabase.co — not the Papperly Worker URL                                                    |
| Migrations                              | 22 applied through Supabase MCP; latest version 20261107142655                                                            |
| Source baseline                         | 28d1f1f31886b4e79fb06320f1bf11db48a21f92; canonical filenames/provenance recorded in the subsequent local commit          |
| Migration integrity                     | All 22 source SQL SHA-256 hashes match migration-provenance.json; only filenames changed to provider-assigned versions    |
| RLS coverage                            | 60 application tables; RLS enabled on all 60                                                                              |
| Native SQL checks                       | 21 assertions passed using authenticated/anon database roles and transaction-local claims; all synthetic data rolled back |
| Data API checks                         | Four passed: public directory 200, anonymous results 401, service dispatcher 401, private schema 406                      |
| Local regression                        | 29 tests/eight suites; lint, TypeScript, formatting, frontend-absence and Worker dry-run build passed                     |
| Git repository / branch                 | MrUjjawalMishra/papperly / feat/backend-v1; commits remain local because writes return 403                                |
| Cloudflare release URL / deployment ID  | None                                                                                                                      |
| Automatic CI deployment                 | Workflow source prepared; not enabled, triggered or verified                                                              |
| Previous known-good application release | None                                                                                                                      |

Evidence: supabase-staging-evidence.json, supabase-http-smoke.json, supabase/migration-provenance.json and tests/live/rls-checks.sql. Database TypeScript types were generated from the live schema. The private schema remains outside the exposed Data API schemas. No real users, reusable credentials or student records were provisioned.

A native SQL test initially retained the previous user claim while switching to anon. The harness was corrected to clear claims; no application authorization was weakened. A later local WASM test exceeded the old five-second harness timeout. Suites now run without file parallelism and with a 15-second test budget, independently of the unpassed staging performance target.

The default rls_auto_enable event-trigger helper no longer has anonymous execution permission. Supabase still reports informational default-deny private tables and warnings for intentionally callable checked RPCs. These are reviewed/documented, not silently treated as a clean advisory report. Guidance: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy and https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable and https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable . Exhaustive RPC authorization coverage remains a Version 1 gate.

Remaining external blockers: GitHub Contents/workflow-file write permission; verified Cloudflare account/Worker bindings and scoped deployment token; server-side Supabase secret key in secure runtime settings; Auth configuration/initial owner setup; provider selection and approved budget/retention. No server secret is retrievable through the exposed Supabase tools. Supabase MCP handles database operations now; unattended GitHub CI will still require its own securely scoped credentials.

Recovery: do not rerun the original migration filenames or reset the project. The canonical migration versions now match Supabase history. Future schema changes use additive migrations/forward fixes. There is no application release to roll back. Backup/restore rehearsal, live Auth/Worker sessions, private R2/Queue/cron/scanner behavior, and the 50-examinee mixed-load target remain unverified. Full implementation gaps remain in backend-requirements.md. Earlier local-only records are retained under docs/history.

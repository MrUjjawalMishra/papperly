# Decision register

The attached PRD remains Version 1 and is preserved verbatim. Its UI-first delivery sequence is superseded by the user's backend-only implementation request. Attached-document statements such as “no application changes or deployment are part of this document update” describe the earlier document task, not the current implementation authorization.

Approved during this task on 2026-11-07:

- Intended repository: https://github.com/MrUjjawalMishra/papperly. GitHub connector confirmed account, repository and push permission. Existing repository is public and initially empty; visibility is preserved.
- Cloudflare Workers, Supabase PostgreSQL/Auth, private R2, Queues, GitHub. Standard staging names are provisional configuration, not verified provider resources.
- Password issue/reset-only, without later plaintext redisplay.
- Student initial name/roster credentials and student-only ASCII case-insensitive passwords. Implemented as `name-roster-ascii-fold-v1`, applied at provisioning, login, change and reset. Staff passwords remain case-sensitive. First-name/class/section/roll fixtures follow the PRD provisional `Ujjawal.9B15` example. Collision suffixes are reserved transactionally. Non-Latin first names use the labelled `student.<roster>` fallback. Generated passwords shorter than eight characters fail closed for explicit credential-policy review; no padding or new pattern is silently invented.
- Support access: read-only operational metadata and status only, excluding private student data and sensitive credentials. There is no student-dashboard impersonation or student-action capability.
- Backend only; apps/web contains README.md only.

Still requires configuration/decision before real-data operation:

- Cloudflare account ID, actual staging Worker URL, authorized Supabase project ref/organization/environment, origins, alias domain, owner UUID and provider secrets through secure settings.
- AI model/provider evaluation (including the 30-question preservation benchmark); approved private scanner and data-processing terms. Existing HTTP adapters define contracts without selecting a provider.
- Monthly infrastructure/AI/storage budget, real staging resource provisioning, retention/deletion school agreement, backup plan and restore rehearsal.
- Staging branch protection, environment secrets and CI enablement; no production promotion has been authorized.

No credentials, API tokens, student answers, private query content, or reusable plaintext account passwords belong in audit logs, fixtures, commits or this document.

2026-11-08 operational implementation decisions: staging identifiers/secrets/deployment are verified in release evidence; prior missing-configuration entries above are historical. Owner bootstrap is a restricted server-key CLI, never a public route. The database permits one active owner while retaining inactive historical owner membership IDs for append-only audit attribution. An explicit OWNER_USER_ID may pin login; otherwise the service-only adapter resolves the active singleton. Existing active owners are never reset or replaced by bootstrap retries. Synthetic acceptance deactivates its identities, revokes sessions, deletes Auth users and suspends schools while retaining tagged audit/exam fixtures. Public signup is disabled and email/password sign-in remains enabled, as verified against live Auth settings.

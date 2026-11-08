# Approved free provider integrations

User decision: Google Gemini free-tier Flash, private ClamAV, $0/month, no paid services or automatic upgrades. The prior paid-upgrade authorization is superseded. Code refuses new infrastructure creation under the zero-spend target. Billing read permissions are unavailable for the Cloudflare account, so a verified account-wide $0 billing cap is not claimed; no plan upgrade or paid provider fallback is performed.

## Gemini

The adapter pins `gemini-3.8-flash`, currently listed with a free standard tier in Google's official pricing table. It uses the Interactions REST API with revision `2026-05-20`, JSON Schema response formats, `store:false`, no tools/grounding/background execution, a 20-second timeout and bounded request/streamed-response sizes. It rejects model rerouting, incomplete/non-JSON output and unexpected tool steps. Provider error bodies and keys are never logged. There is no generic paid gateway or model fallback. The 2.5 Flash alias is deliberately not used because the provider documents its deprecation/rerouting.

Save GEMINI_API_KEY in the existing Cloudflare GitHub environment and set GEMINI_FREE_TIER_CONFIRMED=true only after confirming its Google project is free and has no billing enabled. The flag is an operator attestation, not an API-verified billing status. The release script passes the key via its temporary secret file and removes that file afterward; it enables the flag only when both the key and confirmation are present. The key stays server-side. Disable the confirmation flag to disable AI; removing a GitHub secret alone does not delete an existing Worker secret.

Per-school transactional reservations remain enforced. An additional service-only reservation admits at most 20 provider attempts across all schools per UTC day; retries consume attempts and duplicate live run tokens cannot reserve another call. Provider limits can be lower and return a specific rate-limit status. No unlimited retries, automatic quota purchase or billing enablement exists. Saves/submissions never wait for AI.

Zod-generated schemas are checked for drift. Formatting must preserve normalized original prompt/option text; invalid or invented visible wording is rejected, missing keys remain explicit and teacher approval is always required. Subjective suggestions are rubric-bounded and retain server-attributed model/prompt metadata; approved teacher marks remain protected by database guards. Guidance requires published evidence IDs, validated sufficiency and no unvalidated numeric prose. Current resource-link support remains fail-closed until the authorized-resource projection is implemented.

The restricted ops/staging-ai-checks workflow makes at most three synthetic requests: a 30-question mixed-format preservation benchmark, rubric suggestion and evidence-only guidance. It records counts, latency and status only. Unit/mock tests do not establish live provider integration. The workflow must finish successfully before that status changes. The provider free-tier terms allow product-improvement use; stateless storage does not override those terms. Real student data requires the PRD's school processing authorization and term review before a real-data pilot. Synthetic verification is not that authorization.

Official sources verified 2026-11-08: [pricing/free tier](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash), [model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Interactions API](https://ai.google.dev/api/interactions-api), [storage controls](https://ai.google.dev/gemini-api/docs/interactions#data-storage).

## ClamAV

See apps/scanner/README.md and clamav-verification-evidence.json. A real local daemon/gateway corpus is verified; a persistent free scanner host is still needed. No paid compute has been provisioned. Missing configuration, stale definitions, incomplete scanning or a hash mismatch leaves uploads unavailable/quarantined. The Worker does not follow scanner redirects. A local Docker service is not a permanent staging deployment.

An initial expanded-archive probe returned clean from the engine; the gateway now validates ZIP metadata, CRC, actual bounded inflation and nested limits before asking ClamAV. The same over-limit case now returns unavailable. This result is recorded without waiving freshness or scan limits.

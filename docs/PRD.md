# Papperly — Product & Project Requirements Document

**Version:** 1.0 — Consolidated product baseline\
**Date:** 7 November 2026\
**Status:** Proposed implementation baseline\
**Project type:** Capstone project with a multi-school subscription model\
**Platform:** Responsive web application\
**Application name:** Papperly  
**Scope:** Timed exams, teacher-led communities, private student queries, shared student registration, Excel imports, audit trails, student progress analytics, school reporting, and teacher profiles/articles.  
**Decision status:** Complete proposed Version 1 PRD; unresolved credential choices are explicitly listed in Section 24.

This is the single consolidated **Papperly Version 1 PRD**, incorporating all requirements from the earlier drafts and the dashboard/profile discussion. Earlier draft numbers are superseded; this is not PRD 3. Delivery milestones below are implementation stages within Version 1, not separate product versions. New requirements do not cancel earlier requirements unless an explicit conflict resolution is stated.

**Reading guide:** Sections 1–16 cover the exam foundation and stack; 17–24 cover community, queries, identity, audit, security, and delivery; 25–28 cover the student progress dashboard, school reports, teacher directory/profiles, and complete Version 1 traceability.

## 1. Product overview

Build Papperly, a role-based platform that helps schools conduct online examinations, distribute learning materials through teacher-only groups, resolve private student queries within teacher-set deadlines, track learning progress, and discover teacher profiles and educational articles. Teachers enter their own questions, use AI to organize those questions into a structured paper, review and publish the paper, assign it to their students, conduct a timed exam, and review submitted answers. The system automatically marks objective responses and uses AI to assist with subjective evaluation. The teacher remains responsible for the final marks and result publication.

The platform owner creates school accounts and manages subscription access. Each school administrator creates teachers, and school administrators or authorized teachers create shared school student accounts. Users sign in explicitly using an assigned ID and password. There is no public registration, social login, magic-link login, or automatic entry into an account.

The first implementation is a hard-coded demonstration so the interface and workflow can be tested before adding real authentication, database persistence, and AI services. A demonstration is not considered a secure production MVP.

## 2. Problem and goals

Teachers spend time formatting question papers, distributing exams, collecting answers, and checking responses. Schools need a consistent process with controlled access and results available to the right people.

### Goals

- Reduce repetitive paper-formatting and marking work.
- Support objective questions and typed subjective answers in the same exam.
- Give teachers control over AI suggestions, answer keys, marks, and results.
- Provide timed attempts with visible save status and recovery after refresh.
- Support multiple isolated schools from the first working MVP.
- Deliver a complete, demonstrable school-to-student workflow suitable for a capstone.
- Present evidence-based student improvement guidance and authorized longitudinal school reports.
- Support deliberate teacher discovery and educational reading without social-feed, comment, or rating features.

### Initial success criteria

These are proposed pilot targets, not measured performance claims. Expanded community, query, and registration acceptance requirements appear in Section 23.

| Outcome             | Acceptance target                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| End-to-end workflow | Owner provisions school; school creates teacher; teacher creates students, publishes an exam, reviews submissions, and releases results                      |
| Supported formats   | All five formats in Section 6 work, including typed subjective answers                                                                                       |
| Objective accuracy  | All approved scoring fixtures produce exact expected marks                                                                                                   |
| Isolation           | Automated negative tests deny every tested cross-school access path                                                                                          |
| Reliability         | Server-acknowledged answers survive refresh; repeated submission creates one final attempt                                                                   |
| Pilot capacity      | Demonstrate 50 simultaneous students across at least two schools                                                                                             |
| AI usefulness       | On a teacher-labelled set of 30 questions, at least 90% preserve wording, options, and intended type without material correction; exceptions remain editable |
| Human control       | No AI-generated paper or subjective grade becomes student-visible without teacher approval                                                                   |

## 3. Roles and permissions

A school is a tenant within one shared application, not a separately generated website. Every school has its own users, classes, exams, submissions, and reports.

| Role                 | Created by           | Allowed actions                                                                                                        | Boundaries                                                                |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Platform owner       | Secure initial setup | Create schools and school administrators; configure plan limits, access dates, and school status; view aggregate usage | No routine access to student answers; operational actions audited         |
| School administrator | Platform owner       | Manage teachers, classes, roster, student reports, teacher profiles/articles, and account resets                  | Own school only; cannot create owners or change subscription entitlements |
| Teacher              | School administrator | Create/reuse students; manage groups/queries, exams, assigned student reports, own profile/articles                 | Assigned classes and authorized exams only                                |
| Student | School administrator or authorized teacher | Take exams, view groups/results/progress, raise queries, search teachers, change own login ID/password | Own records and permitted groups only |

“Teacher admin” means the teacher's student-management capability; it is not a fifth role. One student can belong to a class taught by multiple teachers. Existing students must be assigned to the relevant class instead of receiving duplicate accounts for each subject.

School administrators can also create/reset student accounts and manage imports. Teachers may create students in their school, but creation does not grant access to every class: student-detail changes, resets, group membership, queries, and exams require an assigned class or explicit administrator delegation. Teachers cannot create other teachers. This is the proposed permission boundary for the request that “any teacher” can create students.

School administrators can reassign classes, groups, queries, and exams when a teacher leaves. The change is audited. Original submission ownership and history remain intact.

## 4. Scope and release stages

| Capability                | Stage A: hard-coded prototype                      | Stage B: working MVP                                                | Later                                          |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| Role dashboards           | Mock data and clearly labelled role preview        | Real account permissions                                            | More granular permissions                      |
| Schools and subscriptions | Sample schools and plan screen                     | Owner-managed access, dates, and quotas                             | Payment gateway and automatic renewals         |
| Question paper            | Fixed seeded paper; editable preview               | Manual authoring plus AI formatting                                 | PDF/OCR import and richer question banks       |
| Exam taking               | Simulated timer, answers, submission               | Server-enforced timer and persisted answers                         | Additional assessment modes                    |
| Checking                  | Mock AI suggestions and deterministic demo scoring | Objective scoring, AI-assisted subjective marking, teacher approval | Rubric analytics and expanded moderation       |
| Notifications | Sample list | Exams, groups, queries, deadlines, credential changes | Email/push |
| Progress dashboards | Synthetic student trends and AI suggestions | Published-result analytics and automatic improvement guidance | More advanced learning models |
| Teacher directory/profiles | Sample profiles and articles | School-managed profiles, search, moderated articles, scoped statistics | Broader discovery if explicitly approved |
| Files | Sample documents | Private group and query attachments | Exam diagrams and handwritten answers |
| Community | Mock teacher groups | Teacher-only posts and approved membership | Expanded resources |
| Student queries | Mock 24-hour and 7-day cases | Private threads, deadlines, replies, escalation | TA/call assistance |
| Excel registration | Import preview fixtures | Validated bulk creation and duplicate reuse | Advanced roster integrations |

### Explicit MVP exclusions

Algorithmic social feeds, infinite-scroll discovery, comments, ratings, student-to-student chat, webcam proctoring, biometric verification, native mobile apps, live video teaching, automatic payment collection, essay plagiarism certification, handwriting recognition, and AI-generated high-stakes grades without review are outside the MVP.

Negative marking remains a later enhancement. Section-wise question/option randomization, Excel import, teacher announcement groups, and private queries are now included in the expanded MVP. Deliver them in milestones rather than one untested release.

## 5. Core user journeys

### 5.1 Provision a school

1. Owner creates a school with name, unique school code, administrator login ID, access period, and plan limits.
2. The system provisions the administrator account and displays a temporary password once.
3. The school administrator signs in and creates classes and teacher accounts.
4. The administrator assigns teachers to classes or sections.
5. Teachers create students or select existing school students for their assigned classes.

### 5.2 Create and publish an exam

1. Teacher opens the **Questions** tab and pastes or types questions.
2. Teacher selects **Format with AI**, or uses manual authoring.
3. AI proposes structured question types, options, numbering, sections, and marks. Missing or ambiguous answer keys are flagged.
4. Teacher edits questions, confirms answer keys, supplies subjective rubrics, and previews the student paper.
5. Teacher selects recipients, opening/closing times, duration, title, class, subject, and instructions.
6. Validation checks the paper and schedule. Teacher publishes an immutable exam version.
7. Students receive an in-app assignment notification and see the exam after signing in.

### 5.3 Take an exam

1. Student signs in, opens an assigned exam, reads instructions, and selects **Start**.
2. Server creates or returns the student's existing attempt and deadline.
3. Student answers questions, navigates the paper, and sees remaining time and save status.
4. Student submits with confirmation, or the deadline ends the attempt.
5. Student sees a submission receipt. Results remain pending until the teacher publishes them.

### 5.4 Review and publish results

1. Objective questions are scored against the approved answer key.
2. AI proposes marks and short rubric-based explanations for subjective answers.
3. Teacher reviews pending/failed AI items, adjusts marks, and records feedback.
4. Teacher publishes the reviewed results.
5. Student receives an in-app notification and sees their own score and released feedback.

## 6. Question formats and scoring

| Type                | Student input                       | Required authoring data                                                      | MVP marking rule                                                                                                 |
| ------------------- | ----------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| MCQ                 | Select one option                   | Prompt, 2–6 options, one correct option, marks                               | Full marks for correct option; otherwise zero                                                                    |
| True/False          | Select True or False                | Statement, correct value, marks                                              | Exact match                                                                                                      |
| Match the following | Dropdown pairing for each left item | Left/right items with stable IDs, correct pair map, marks per pair           | Sum marks for correct pairs; one-to-one mapping in MVP                                                           |
| Fill in the blanks  | Text field for each blank           | Prompt with blank IDs, approved alternatives, marks per blank                | Trim surrounding whitespace and compare case-insensitively against approved alternatives; no semantic AI grading |
| Subjective          | Typed short or long answer          | Prompt, maximum marks, rubric criteria, reference answer or marking guidance | AI suggestion followed by teacher review; manual marking always available                                        |

The first four listed formats are objective in this MVP. Typed subjective questions are included separately to fulfil the subjective assessment requirement. Unanswered questions receive zero. No negative marks apply. Use fixed decimal precision and calculate totals on the server. Rubric criterion maxima must sum to the question's maximum marks.

The teacher must approve proposed answer keys. AI must not silently invent missing answers or alter the meaning of supplied questions. Every question has a stable identifier; answer storage must not depend on display numbering.

## 7. Functional requirements

### FR-01 — Account creation and authentication

- Only the authorized parent role may create an account. Public signup and anonymous authentication are disabled.
- School users enter **school code + login ID + password**. Owner uses a separate owner login entry.
- Login IDs are case-insensitive and unique within a school, across teacher, administrator, and student accounts. The authenticated account determines the role; selecting a role in the interface grants no permissions.
- Recommended credential policy: passwords are shown only when issued and never retrieved later. Owner resets school administrators; administrators reset teachers and students; authorized teachers reset their students. The request for later password visibility is recorded as an unresolved alternative in Section 19; it is not silently treated as approved.
- Proposed default: administrators and teachers change temporary passwords at first sign-in; student password change is available but not mandatory in the MVP.
- Rate-limit failed login/reset attempts and return generic invalid-credential errors.
- Use a server-managed session with secure HttpOnly cookies, CSRF protection for mutations, explicit logout, and expiry. No persistent “remember me” feature. Refreshing an active exam must preserve the current authenticated session.
- Proposed session policy: up to 12 hours absolute lifetime, with a 30-minute inactivity timeout outside an active exam. A valid active attempt remains usable until its deadline within the session lifetime. Document browser session-restoration limitations; do not claim browser closure guarantees logout.
- Disabling a user or resetting credentials revokes application sessions. Owner account recovery uses a documented restricted operational procedure.

### FR-02 — School subscription access

- Owner can set plan name, active dates, maximum teachers, maximum students, and monthly AI allowance.
- MVP subscriptions are recorded and activated manually after an off-platform agreement. No payment details are collected.
- Exceeding a quota blocks the relevant new creation or AI job with a clear message; it does not delete existing data.
- When access expires, prevent new exams and attempts. Attempts already started may finish by their original deadline. Existing results remain readable and staff can finish marking those attempts.
- Security suspension is a separate owner action that can revoke access immediately. Audit the reason.
- Quota checks and increments must be atomic so concurrent requests cannot bypass limits.

### FR-03 — Class and student management

- Administrator creates class/section records and assigns teachers.
- Teacher can create/reuse school student identities; editing profiles, resetting credentials, and managing enrollment requires assigned-class access or administrator delegation (Section 19).
- Prevent duplicate login IDs and duplicate student identities using the shared registry and academic-year roster constraints in Section 19. Student enrollment is independent of the teacher who originally created the account.
- Students can change their login ID and password later without a mandatory first-login change. Dashboard records update using the same immutable student ID. Password values never appear in recommended audit/dashboard views.
- Deactivate accounts rather than deleting exam history. Class transfer does not silently grant access to old exams.

### FR-04 — Question authoring and AI formatting

- Provide manual creation, raw text input, AI conversion, editable preview, and draft save.
- Preserve original raw text beside the generated draft for review.
- Validate structured AI output against a strict schema before saving. Reject unsupported types, broken pair mappings, missing options, invalid marks, or malformed blanks.
- Never publish automatically after conversion. If AI fails or quota is exhausted, retain the input and allow manual editing.

### FR-05 — Exam publishing and assignment

- Required fields: title, subject, recipients, instructions, questions, answer key/rubric, duration, opens_at, and closes_at.
- Closing time must follow opening time. Duration must be positive and no longer than the available window.
- Store timestamps in UTC and display the school's configured timezone; default Asia/Kolkata.
- Assignment can target a class or selected students in the teacher's assigned classes. Resolve and store the recipient list at publication; later class enrollment does not silently change it.
- Publishing freezes questions, marks, keys, rubrics, timing, and recipients for that version. Changes require a new draft/version; started attempts remain linked to their original version.
- Before any attempt starts, teacher can cancel and republish. After attempts begin, no silent edits or destructive cancellation; archive only after completion.

### FR-06 — Timed attempts and recovery

- One attempt per student per exam version in the MVP. Repeated Start requests resume it.
- Deadline is the earlier of start time plus duration and the exam closing time. A late starter receives only the remaining window, shown before starting.
- Use server time for admission, saving, and submission. Changing the device clock cannot extend an attempt.
- Save changes after a short debounce and on navigation; display Saving, Saved, or Offline/Unsynced. Only server acknowledgement means saved.
- Retain unsynced answers locally for the same user and attempt. Reconnect may sync them only before the server deadline. Clear local answers after confirmed submission or logout.
- Refresh retrieves persisted answers and the same deadline. Newer answer revisions must not be overwritten by late-arriving older saves.
- At the deadline, lock editing and finalize the last server-saved answers. A scheduled backend sweep and request-time checks finalize attempts even if the browser closes.
- Unsynced answers arriving after expiry are rejected and explicitly reported; offline work cannot be guaranteed to submit after the deadline.
- Submission is transactional and idempotent. Double clicks, retries, and a timeout race return one final receipt. A unique student/exam constraint prevents duplicate attempts.
- If multiple tabs edit the same attempt, revision checks reject stale writes and ask the user to resume from the current state.

### FR-07 — Marking and teacher review

- Grade objective questions deterministically on the server using the frozen answer key.
- Run subjective AI checks asynchronously after finalization. Store suggested marks, rubric reasons, model identifier, prompt version, and processing status.
- Validate all suggested marks against criterion and question bounds. Invalid output is marked for manual review.
- Teacher can accept or replace AI suggestions and enter feedback. Preserve AI suggestions separately from final marks.
- Re-running AI must never overwrite teacher-approved marks.
- AI failures do not block submission or manual evaluation. Teacher can finish grading without AI.
- Final result publication requires every question to have a final score. A later correction creates an audited result revision and an updated student notification.

### FR-08 — Results and notifications

- Teacher sees assigned, started, submitted, expired, and awaiting-review counts, plus student-wise marks and completion status.
- School administrator sees own-school participation, aggregate results, and individual longitudinal student progress reports (Section 26). Assigned teachers see reports within their authorized teaching scope. Detailed raw-answer access remains separate from report access.
- Students see their own published total, per-question scores, and teacher feedback. Answer-key release is off by default and can be enabled only after the exam closes.
- In-app notifications cover exam assignment, result publication, group posts, query replies/deadline changes, and account-security changes, with read/unread state and an authorized destination link.
- Fetch notifications on sign-in/dashboard load, with periodic refresh while open. Push messaging is later work; community and query notifications are specified in Sections 18 and 20.

## 8. Recommended technology stack

These are architecture recommendations for this capstone, not requirements imposed by the providers. Official documentation checked on 7 November 2026 is linked in Section 16.

| Layer             | Recommendation                                                           | Reason and responsibility                                                             |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Frontend          | React + TypeScript + Vite                                                | Shared question components, typed data, and a straightforward SPA build               |
| UI styling        | Tailwind CSS with accessible components                                  | Consistent forms, tables, layouts, and responsive dashboards                          |
| Hosting           | Cloudflare Workers Static Assets                                         | Serve the built frontend alongside the API deployment [S1]                            |
| Backend API       | Cloudflare Workers, TypeScript                                           | Central permission checks, timer enforcement, authoring, submission, and AI calls     |
| Database          | Supabase PostgreSQL                                                      | One relational source of truth for schools, rosters, exams, answers, and marks        |
| Authentication    | Supabase Auth behind a Worker login/session layer                        | Managed password authentication with application-level ID mapping [S2]                |
| Tenant protection | PostgreSQL Row Level Security plus API authorization                     | Defense in depth for school and user access [S3]                                      |
| Async AI work     | Cloudflare Queues + Worker consumer                                      | Retryable marking jobs outside the submission request [S4]                            |
| AI integration    | Server-side provider adapter; choose one provider/model after evaluation | Avoid tying exam data to a single model's output format; support mock responses first |
| Private files | Cloudflare R2 with authenticated Worker downloads | Group materials and query attachments in the MVP; scan/quarantine pipeline required [S10] |
| Source control    | Private GitHub repository                                                | Code, migrations, tests, documentation, and issue tracking                            |
| CI/CD             | GitHub Actions + Wrangler                                                | Proposed build/test/deploy pipeline, with separate staging and production             |
| Verification      | Vitest, Playwright, and SQL/RLS integration tests                        | Scoring rules, role workflows, timer behavior, and tenant isolation                   |

### Architecture decisions

**Use Supabase PostgreSQL for all core exam data.** Do not introduce a second exam database in Cloudflare D1 for this MVP. A single database simplifies transactions, reporting, and tenant rules. Cloudflare hosts the application; Supabase supplies authentication and data services.

**ID-based login needs an adapter.** Supabase password authentication uses email or phone identifiers [S2], so an arbitrary school login ID is not a direct native sign-in identifier. The Worker resolves school code + login ID to a private, provisioned Auth identity using an immutable internal email alias derived from the student/user UUID under a platform-controlled domain. Changing a display login ID must not rename the Auth identity. Provision these accounts through server-only administration with confirmation handled during provisioning; disable public signup and email delivery for these internal aliases. Users never need to enter an email or receive a magic link. Test account creation, login, reset, and session revocation in a short technical spike before committing to the adapter.

**Use user-scoped database access wherever possible.** The Worker verifies identity and uses the user's access token for RLS-protected queries. Privileged account provisioning and background grading use narrowly scoped server operations with explicit tenant checks. Service-role access can bypass RLS [S3]; it must not become a general shortcut for every request.

**Separate answer keys from student-visible records.** Store keys and rubrics in protected tables or schemas. Student question payloads expose prompts and response options only. Hiding fields in the interface is insufficient.

**Queue grading safely.** Persist submission and a grading-job/outbox record in one database transaction. A dispatcher sends pending jobs to the queue and retries delivery. Consumers deduplicate by submission, question, rubric version, and grading version. This prevents lost grading work if queue delivery fails after submission.

### Logical data flow

Browser → Cloudflare frontend/API → Supabase Auth/PostgreSQL. After submission, the API records grading work; a queue consumer calls the chosen AI provider, stores suggestions, and makes them available for teacher review. The browser never receives AI secrets, service-role credentials, or unpublished answer keys.

### Cost assumptions

Stage A requires no live AI calls. Stage B has hosting, database/authentication, queue, and AI usage costs that depend on provider plans and traffic. Free allowances may support development but are not a production guarantee. No exact monthly budget is assumed.

Track AI usage per school, cap request size/output size, limit retries, reserve allowance before jobs run, and display quota exhaustion clearly. Estimate monthly spend from active students × exams × subjective answers × average AI evaluation cost, plus paper-conversion calls and infrastructure. Select the AI model after testing quality, latency, cost, and data-handling terms on anonymized sample answers.

## 9. Minimum data model

| Entity                  | Important fields and relationships                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| schools                 | ID, unique school code, name, timezone, status                                             |
| school_subscriptions    | School ID, plan, access dates, user limits, AI quota                                       |
| profiles / memberships  | Auth user ID, school ID, login ID, role, active status                                     |
| sessions                | Opaque session ID/hash, user ID, expiry, revocation; provider tokens protected server-side |
| classes / enrollments   | School ID, class/section, student membership                                               |
| teacher_assignments     | School ID, teacher ID, class ID                                                            |
| question_drafts         | School ID, author, original text, structured content, draft state                          |
| exams / exam_versions   | School ID, teacher ID, title, timing, duration, immutable published version                |
| exam_questions          | Version ID, question ID, type, prompt, options, marks, position                            |
| question_keys / rubrics | Protected scoring data linked to version and question                                      |
| exam_recipients         | Version ID, school ID, student ID; explicit publication snapshot                           |
| attempts                | School ID, exam version, student, started_at, deadline, finalized_at, status               |
| answers                 | Attempt ID, question ID, response, revision, saved_at                                      |
| grades                  | Answer ID, objective score, AI suggestion, final score, reviewer, feedback, revision       |
| grading_jobs / outbox   | School ID, attempt/question, status, retry count, deduplication key                        |
| notifications           | School ID, recipient ID, type, destination, read_at                                        |
| audit_events / ai_usage | Actor, school, operation, timestamps; quota consumption and job metadata                   |

All school-owned records carry a non-null school ID. Foreign keys and composite constraints prevent links between records from different schools. The server derives school context from authenticated membership, not a trusted request-body field. Student-facing reads use explicit field projections. Operational logs exclude passwords, provider tokens, and full student answers.

## 10. State rules

**Exam:** Draft → Published → Closed → Archived. Open/closed availability is derived from the schedule. Cancellation is permitted before any attempt begins. Result publication is tracked separately from exam availability.

**Attempt:** Not started → In progress → Submitted or Expired. Submitted and Expired are terminal states; neither can accept answer changes.

**Grading:** Pending → Processing → Ready for review → Reviewed → Published. Failures move the affected item to Needs manual review. A teacher can complete marking without waiting for another AI retry.

## 11. Screens and interface requirements

| Area                 | Required screens                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Shared               | Login, change password, session expired, access denied, loading and service-error states                                                |
| Owner                | School list, create/edit school, administrator credentials, plan/access limits, usage summary                                           |
| School administrator | Dashboard, teachers, classes, teacher assignments, roster, school summary                                                               |
| Teacher              | Dashboard, students, Questions tab, exam editor/preview, schedule and recipients, conduct dashboard, submission review, publish results |
| Student              | Dashboard, notifications, exam instructions, timed exam, submission receipt, published result                                           |

The student exam screen includes title, timer, question navigation, answer controls, save status, and submit action. Use keyboard-accessible controls, visible focus, readable contrast, labels, and error text. Matching questions use dropdowns rather than drag-only interaction. Do not rely only on color. Warn at five minutes and one minute without interrupting typing.

Target desktop school labs first while keeping student pages usable on small screens. Tables may scroll on small screens; essential exam actions must remain visible. Use plain language such as “Answers saved” and “Result awaiting teacher review.”

## 12. Hard-coded prototype specification

Use fixture data behind a repository/service interface that can later be replaced by real API calls. Demo role switching must be labelled **Preview mode** and excluded from production builds. Use fictional names and credentials only.

### Seed dataset

- Two fictional schools to demonstrate separate dashboards.
- One owner, one administrator per school, two teachers per school, and at least five fictional students per school.
- One Class IX Computer Applications paper, 30 minutes, 25 marks.
- One complete student submission, one in-progress attempt, and one unstarted assignment.
- Example exam-assigned and results-published notifications.

| Section             |                    Questions |  Marks |
| ------------------- | ---------------------------: | -----: |
| MCQ                 |                        5 × 1 |      5 |
| True/False          |                        3 × 1 |      3 |
| Match the following |  1 question with 4 pairs × 1 |      4 |
| Fill in the blanks  | 3 questions with 1 blank × 1 |      3 |
| Subjective          |                        2 × 5 |     10 |
| **Total**           |      **14 question records** | **25** |

### Prototype must demonstrate

1. Questions tab showing the seeded paper and an editable formatted preview.
2. A mocked **Format with AI** action labelled as a simulation.
3. Publishing/assignment interaction using fixtures.
4. Student controls for every format, navigation, countdown, local refresh recovery, and submission summary.
5. Deterministic objective scoring plus illustrative AI suggestions for subjective answers.
6. Teacher score edits and result publication, followed by the student result view.
7. Empty, loading, validation-error, offline, expired, and AI-failure screens.

Prototype timing, permissions, and storage are simulations. Fixture keys may exist in a demo bundle; real answer keys must be moved to protected backend storage before any real student exam. No real student data should be entered into the prototype.

## 13. Security, reliability, and quality requirements

- Enforce permissions on every API route and database operation; test direct requests as well as interface navigation.
- Keep secrets in environment-specific secret stores. Commit only example environment variable names to GitHub.
- Treat question text, student answers, teacher bios, and article content as untrusted input. Render safely, constrain payload sizes, and avoid arbitrary HTML execution.
- Treat text passed to AI as data, not instructions. AI has no tools to modify accounts or publish marks. Validate output even when the provider claims structured responses.
- Send the AI provider only the question, rubric, and answer needed for evaluation; omit student names and login IDs. Establish school authorization and retention requirements before a real-data pilot.
- Keep an audit trail for account provisioning, resets, publishing, grading changes, result publication, and subscription changes.
- Verify backup and restore procedures before the pilot. Record the selected provider plan's actual recovery capabilities; do not assume them.
- Proposed load target: 50 concurrent examinees; 95th-percentile answer-save and submission responses under two seconds under the agreed test network, excluding AI job completion. Measure and report results.
- Proposed accessibility target: WCAG 2.2 AA for critical login and exam flows, verified through keyboard and contrast checks; this is a target, not a certification claim.
- Proposed retention baseline: retain exam records through the school academic year plus 90 days, subject to school agreement before production. Implement an owner-approved deletion/export process; never let account deactivation erase submissions accidentally.
- Browser focus/tab signals are included as advisory integrity events and cannot prove cheating. The MVP does not promise a cheat-proof examination environment.

## 14. Delivery plan and release gates

| Milestone          | Deliverable                                                                           | Exit gate                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A — UI prototype   | Hard-coded paper, four role views, simulated workflow                                 | All formats usable; 25-mark fixture totals correct; demo clearly labelled |
| B1 — Foundation    | GitHub project, Cloudflare deployment, Supabase schema/auth, roles and schools        | Real account chain works; two-school isolation tests pass                 |
| B2 — Exam engine   | Manual authoring, immutable publishing, recipients, timers, saved answers, submission | Refresh/retry/expiry tests pass; keys never exposed                       |
| B3 — AI assistance | Conversion, background subjective grading, manual fallback                            | Schema checks, failure handling, quota checks, and teacher approval pass  |
| B4 — Learning support | Teacher groups, private files, student queries, deadline monitoring | Membership, privacy, and deadline tests pass |
| B5 — Dashboards and directory | Student/school reports, AI guidance, profiles and articles | Sections 25–28 acceptance gates pass |
| B6 — Version 1 pilot | All modules and documentation | Complete Version 1 acceptance suite passes |

No calendar estimate is committed until developer availability and capstone deadline are known. Follow the revised gates in Section 23: foundations and exam engine first, then groups and private queries, then integrated pilot. Automated payments and live calls remain future work.

### GitHub and deployment requirements

Store frontend, Worker API, shared schemas, SQL migrations, fixtures, tests, and setup documentation in one repository. Protect the release branch and run type checking, unit tests, authorization tests, and production builds in CI. Use separate development/staging/production configuration and data. Apply migrations through a controlled process and record deployment versions. CI may deploy staging after checks; production promotion follows an explicit release decision. Do not place real credentials or student datasets in fixtures.

### Capstone deliverables

Working prototype, working MVP, source repository, database migrations/schema, architecture explanation, setup/deployment guide, test evidence, role-permission matrix, anonymized demonstration dataset, demo walkthrough, student/school progress-report demonstrations, teacher directory/profile demonstrations, and a limitations/future-work section.

## 15. MVP acceptance checklist

- [ ] Owner creates two schools with distinct administrator accounts and limits.
- [ ] Each administrator creates teachers; teachers create students in assigned classes.
- [ ] ID/password login succeeds; public registration and unauthorized role creation fail.
- [ ] Cross-school and unassigned-class requests fail even when IDs are manually changed.
- [ ] All five question formats can be authored, previewed, answered, and marked.
- [ ] Invalid or incomplete AI output cannot be published until corrected.
- [ ] Publishing locks the version and sends notifications only to intended recipients.
- [ ] A student cannot start early, after closing, without assignment, or for a second attempt.
- [ ] Device-clock changes and refreshes do not reset the deadline.
- [ ] Acknowledged answers survive reload; stale writes cannot overwrite newer revisions.
- [ ] Temporary offline changes sync before expiry; late saves are rejected with a clear explanation.
- [ ] Browser closure does not prevent backend expiry/finalization.
- [ ] Duplicate submission and queue delivery do not duplicate attempts or marks.
- [ ] Objective scoring matches the teacher-approved fixtures exactly.
- [ ] Student payloads and database access cannot expose answer keys or unpublished marks.
- [ ] AI failure permits manual marking; teacher overrides survive AI retries.
- [ ] Results remain hidden until reviewed and published; students see only their own results.
- [ ] Expired subscription access and active-attempt grace behavior match FR-02.
- [ ] Credential reset/deactivation revokes sessions; secrets are absent from browser bundles.
- [ ] Pilot concurrency, accessibility checks, and restore rehearsal have recorded outcomes.

## 16. Source notes for stack selection

Sources support provider capabilities; the product rules, data model, limits, and implementation decisions above are proposed requirements.

- **[S1] Cloudflare Workers Static Assets:** supports serving frontend assets with Worker logic, including a React/Vite SPA and API arrangement. [https://developers.cloudflare.com/workers/static-assets/](https://developers.cloudflare.com/workers/static-assets/)
- **[S2] Supabase password-based authentication:** documents email/phone password sign-in; the school login-ID mapping described here is application logic. [https://supabase.com/docs/guides/auth/passwords](https://supabase.com/docs/guides/auth/passwords)
- **[S3] Supabase Row Level Security:** documents database access policies and privileged service access considerations. [https://supabase.com/docs/guides/database/postgres/row-level-security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- **[S4] Cloudflare Queues:** provides background message processing with retry/delay capabilities; application-level deduplication remains required. [https://developers.cloudflare.com/queues/](https://developers.cloudflare.com/queues/)

## 17. Consolidated product scope and assessment

Papperly Version 1 combines exams, teacher announcements, private learning queries, progress reporting, and teacher profiles/articles. They share one school roster and one identity per student. All belong to the Version 1 scope; live teacher/TA calls remain future work. Sections 18–28 complete the requirements alongside the exam foundation above.

| Suggestion | Assessment | PRD decision |
|---|---|---|
| Teacher-only subject/class groups | Clear channel for notes without noisy student replies | Include; membership approved or assigned by teachers |
| Private questions | Supports students who hesitate to ask publicly | Include; assigned teacher sees the thread |
| Teacher-set response windows | Better than one deadline for every subject | Include per teacher/subject; no assumption that any subject is inherently faster |
| Excel account creation | Saves repetitive work and supports school onboarding | Include preview, duplicate reuse, row errors, and retry safety |
| Shared credentials across teachers | Shared identity is essential; revealing a changed password adds risk | Reuse the account, display current login ID, recommend reset instead of password retrieval |
| Name/class/roll credentials | Memorable but predictable from class information | Preserve requested pattern as provisional; recommend stronger initial passwords for real exams |
| Case-insensitive passwords | Easier to type but reduces possible password combinations | Requested compatibility behavior documented separately from the security recommendation |
| Exam fraud controls | Useful as prevention and evidence, not a guarantee | Server enforcement plus advisory signals and teacher review |

## 18. Teacher-led community groups

### FR-09 — Groups and membership

Teacher creates a group such as **Class 9B — Computer Science**, linked to school, academic year, class, section, subject, and responsible teacher. Student accounts are reused across all subject groups.

- Teacher can directly add students from an authorized roster. Students may request membership in eligible class groups; teacher approval is required before any content is visible.
- Membership states: Pending, Active, Rejected, Removed. Requests never grant temporary access. Repeated requests are deduplicated and rate-limited.
- No public invite link grants automatic entry. One group cannot include another school's accounts.
- School administrator can assign a replacement teacher, audit membership changes, and archive a group. Co-teachers require explicit assignment.
- Active students can view all non-deleted group posts, including older posts; show this before adding a member. Removed students lose server access immediately, including file access. Previously downloaded copies cannot be recalled.
- Class promotion does not silently add students to next year's groups. Archive old groups and create new academic-year membership records.
- Removing a group member does not delete exam attempts or query history. Existing assigned exams retain their recipient snapshot unless explicitly cancelled under the exam rules.

### FR-10 — One-way posts and documents

- Only assigned teachers publish, edit, pin, or remove posts. Students cannot post, reply, react, or comment on group posts. Enforce this at API and database levels.
- Post fields: title, body, author, published timestamp, attachment list, optional pin, edit revision, and deletion status.
- Students see a paginated chronological post list inside the selected group, with pinned posts and unread indicators. There is no global social feed or infinite-scroll discovery. A view/read receipt records access, not proof that the material was understood.
- Notifications are created for active members at publication. New members can read history without receiving every old notification. Notification retries must not create duplicates.
- Editing a post preserves revision metadata; substantive edits may notify active members. Deleted posts become inaccessible; stale notification links show “This post is no longer available.”
- “Ask privately about this” may open a separate query linked to the post. It does not create a public reply.

### FR-11 — Private attachment handling

Proposed initial limits: five files per post/query message, 10 MB per file, and a configurable school storage quota. Allow PDF, DOCX, PPTX, XLSX, PNG, and JPEG. Reject executable files, HTML, SVG, macro-enabled office files, archives, and unsupported formats.

Files upload to quarantine in a private R2 bucket. Validate extension, declared and detected type, size, safe filename, and decompression limits for office formats. A private scanning service checks content before release; scan errors keep files unavailable with a visible retry/manual-review status. Do not send student files to public scanning services. Select the scanning provider during implementation; R2 itself is storage, not a malware scanner. The real-file release gate requires a working scanner or a separately approved narrower format policy.

The Worker authorizes every download against current school and membership/query access, then streams the file. Do not expose a public bucket URL. Force attachment download for office documents and restrict inline previews to sanitized supported types. Logs contain attachment IDs and status, not document contents. Validate upload completion before publishing links, clean up abandoned uploads, and charge quotas only once. These are Papperly controls informed by OWASP file-upload guidance [S7].

## 19. Shared student registry, credentials, and Excel imports

### FR-12 — One student identity per school

Every student has an immutable internal UUID. Names, usernames, roll numbers, classes, and passwords can change without losing exams, memberships, or queries. School administrators manage all students. Teachers reuse existing students rather than generating a separate identity for each subject.

Use a school admission/student number when available. With only the four requested fields, enforce uniqueness for **school + academic year + class + section + roll number**. Names are not a reliable unique identity. An exact roster match reuses the existing student; a same-roll/different-name conflict is held for administrator resolution. Do not automatically merge similar names. Promotion and transfer should operate on the existing UUID; ask for a registry match when importing a new year without admission numbers.

Before creating an account, show an authorized staff member “Student already registered” with current login ID, class/section/roll, and access status. Offer **Add existing student to my permitted group** or **Request access**. An unauthorized teacher must not gain full profile or reset rights just by searching. School-wide minimal duplicate discovery is audited and rate-limited.

### Credential example and ambiguity

The spoken example contains both `Ujjawal.9B` and `9B15` as identifiers. For the prototype, use the following explicit interpretation; confirm the exact username format before real account generation.

| Field | Provisional interpretation |
|---|---|
| Student name | Ujjawal Mishra |
| Class / section / roll | 9 / B / 15 |
| Roster code | 9B15; identifies enrollment within an academic year, not permanent identity |
| Generated login ID | Ujjawal.9B15: first name + dot + class/section/roll |
| Alternate interpretation to confirm | Ujjawal.9B as originally stated; requires a collision suffix for repeated first names |
| Requested initial password | Ujjawal9B15: first name with initial capital + class/section/roll |
| Sign-in context | School code + login ID + password |

A login ID collision is resolved with a displayed suffix such as `.2`; never overwrite another student. For names that cannot produce a valid Latin login ID, propose a school-local `student.<roster-code>` fallback and show it in preview. Store the full original name correctly. Do not regenerate passwords or login IDs when a student advances class unless an explicit account action requests it.

### FR-13 — Changes, case handling, and password recommendation

- Login IDs are case-insensitive. Normalize consistently for uniqueness and lookup while retaining display casing. Prototype rule: 3–64 ASCII letters, numbers, dots, underscores, or hyphens; reject reserved identifiers.
- A student can change their own login ID and password later from Profile. No forced first-login student password change. Require the current password or a verified staff reset session for credential changes. Prevent changes while an exam attempt is active.
- A successful username change updates the same student record immediately and appears in staff dashboards. The old ID stops authenticating and is reserved against reuse to prevent confusion. Existing results remain linked to the UUID.
- Password changes update “Password changed at/by” and session status, not the password value, on staff dashboards. Revoke other sessions and issue a fresh session after self-service changes; staff resets revoke all student sessions.
- Staff reset requires a reason, recent staff authentication, and the correct school/class permission. Never reset a password just because the same student appears in an import.

**Requested case-insensitive password mode:** The user wants capital/small-letter variants accepted. If retained, implement a versioned ASCII case-normalization step in the server login adapter, applied identically at initial provisioning, login, self-change, and reset. Supabase receives the canonical value, never multiple trial variants. Disclose this behavior beside password creation. Do not silently introduce normalization into existing credentials or apply it to owner/staff passwords. Do not advertise this as a native Supabase option.

**Recommended production alternative:** Keep usernames case-insensitive, use case-sensitive passwords, and generate an unpredictable student passphrase rather than a name/roll-derived value. Predictable credentials can be guessed by classmates; rate limiting cannot remove that risk. This is a recommendation awaiting the owner's decision, not a claim that the user approved it [S5].

**Requested password redisplay:** The user asked that another teacher see the existing ID and password. Secure one-way password storage cannot retrieve the original password. Recommended implementation displays the current ID and allows an authorized reset; a new credential can be printed once when issued. A student-changed password is never shown. Persistently displaying current passwords would require a separate recoverable-secret design and materially changes the risk model; it is not included in the recommended implementation. This difference is a decision item in Section 24, not an omitted requirement [S6].

### FR-14 — Excel bulk student registration

Provide a downloadable XLSX template and a preview/confirm workflow. Required columns: **Name, Class, Section, Roll Number**. Academic year is chosen once for the import or provided per row; optional **Admission Number** improves identity matching. Teacher/admin selects the school from their authorized context; spreadsheet cells cannot select another school or create staff roles.

Proposed limits: 300 student rows and 5 MB per file. Accept `.xlsx` only for the first release, not `.xlsm`. Reject formulas in roster fields, external links, encrypted workbooks, oversized decompressed content, and unsupported sheets. Preserve roll numbers as text where leading zeros matter; validate duplicate normalized values consistently.

Workflow:

1. Upload and validate structure without creating users.
2. Preview each row as **New**, **Existing—reuse**, **Conflict**, or **Invalid**, with the reason and proposed ID. No password is displayed for existing users.
3. Correct errors or explicitly select valid rows to process. Preview counts and plan quota impact before confirmation.
4. Commit using an import ID and per-row idempotency key. Database uniqueness protects against two teachers importing simultaneously; the losing operation returns Existing rather than creating another account.
5. Provision Auth and database records through a recoverable state machine: reserve identity → provision Auth user → activate profile. Retry unfinished steps and reconcile orphan records; do not claim a distributed Auth/database operation is one SQL transaction.
6. Return created/reused/failed counts, row-level errors, and access to a one-time credential sheet for newly created students only. Do not include existing passwords or reset existing accounts.
7. Retrying the same batch resumes incomplete rows; importing it again discovers existing students. Audit the actor, source checksum, counts, row decisions, and generated account IDs without recording passwords.

Credential sheets are sensitive: authorized download only, no public link, no logging of contents, no long-term server copy. If the one-time sheet cannot be recovered after a network failure, use an explicit authorized reset; do not duplicate accounts. Escape spreadsheet output that could be interpreted as a formula. Delete raw import files after completion plus a proposed 24-hour troubleshooting window; retain redacted import outcomes under the audit retention policy.

## 20. Private student query resolution

### FR-15 — Routing and privacy

Student chooses an assigned subject/group and teacher, enters a topic, question, optional steps tried, and permitted attachments. The teacher relationship comes from school assignment records; the student cannot send queries to arbitrary users or another school. If multiple teachers are assigned, offer only those teachers. A school administrator can reassign unanswered queries when a teacher is absent.

Threads are private to the student and assigned teacher/co-teacher. Peers cannot browse them. Administrators see assignment, due-date, and overdue metadata by default; content access requires explicit audited support permission. Platform owner sees aggregate usage, not routine query content. Student names are visible to their teacher; the feature is private, not anonymous.

The teacher replies with clear steps, examples, text, and/or documents. Students can clarify or ask a follow-up inside their own query thread; this permission does not enable replies in community groups. MVP answers are teacher-authored. Optional AI reply drafting is future work and cannot auto-close queries.

### FR-16 — Teacher-configurable deadlines

- Teacher configures a default resolution duration per subject/group, with a teacher-level fallback. Suggested choices: 24 hours, 48 hours, 3 days, 7 days, and custom whole hours from 1 to 336.
- Before submission, display “Your teacher aims to resolve this query within 7 days.” After creation, display the exact due date/time and remaining time.
- Server sets `due_at = submitted_at + selected duration`. Snapshot the policy and responsible teacher on the query so later default changes affect new queries only.
- MVP uses elapsed calendar hours, including weekends. Seven days means 168 hours. Business-day calendars and holiday pauses are future options; the UI must not imply them.
- This is a **resolution target**, not merely a first-reply target. Track first_response_at, solution_delivered_at, and student_resolved_at separately. The teacher target is met by delivery of a substantive solution, while student confirmation closes the thread. An acknowledgement does not count as a delivered solution.
- A teacher may revise an individual query's deadline, before or after it is overdue, with a reason. Student receives a notification with old deadline, new deadline, and reason. Retain original due time and all revisions.
- Deadline revisions do not rewrite historical performance. Report both original-target and revised-target completion. Do not let repeated extensions hide overdue history.
- Reassignment preserves the current deadline by default. Any extension is a separate audited action.
- No blanket rule makes mathematics seven days or Hindi one day: the teacher chooses based on actual workload and the school's expectations.

Example: a query submitted on **7 November 2026 at 10:00 IST** is due **8 November at 10:00 IST** under a 24-hour policy, or **14 November at 10:00 IST** under a seven-day policy. Store UTC; display the school's timezone.

### FR-17 — Query states and reminders

States: **Open → In progress → Answered → Resolved**. Teacher's substantive answer sets Answered; the student can mark Resolved or request clarification. Record the teacher's delivered answer time separately so student inactivity does not unfairly count as teacher delay. A teacher can mark a documented solution delivered; that records delivery, not student confirmation. **Overdue** is a computed flag, not a terminal state.

- Student clarification reopens the same query with a linked response cycle and a new teacher-policy deadline shown to the student. Preserve the original cycle's timestamps and outcomes.
- Teacher can request missing information, but the target does not silently pause. Any extension needs an explicit recorded reason and notification.
- Student may withdraw a query with a reason; do not delete its history. Unrelated follow-up questions should create a new query.
- Proposed reminders: teacher at 80% of elapsed target, at due time, and administrator if still without a substantive answer 24 hours after due. Deduplicate each event and cancel obsolete reminders after resolution or deadline change.
- Student gets notifications for creation confirmation, teacher replies, reassignment, extensions, and overdue status. Show “The response is delayed” instead of claiming a guaranteed answer.
- Dashboard offers Open, Due soon, Overdue, Answered, and Resolved filters, plus subject/student search. Reports show volume, first response, solution delivery, revisions, and overdue counts.
- All reminders are in-app in the MVP and visible on the next login. A background job records them even when users are offline; no promise of push or email delivery.

### Future teacher/TA calls

Add appointment proposals, teacher/TA assignment, student acceptance, time slots, cancellation, and controlled call access in a later release. “TA” is provisionally interpreted as teaching assistant; confirm whether the intended meaning differs. A TA is a separate limited role, not an account sharing a teacher's password. Calls must link to a query, preserve privacy, and follow the school's student-safety and recording policy. No recording by default. Scheduling a call alone does not resolve the query.

## 21. Audit logbook and staff support actions

### FR-18 — Audit events

Record account creation/import, reuse/conflict decisions, login success/failure, explicit logout, session expiry/revocation, username changes, password-change/reset events, profile edits, enrollment changes, group membership/posts, query reassignment/deadline changes, exam publication, integrity review, grading overrides, result publication, and subscription changes.

Each event contains immutable event ID, school, server timestamp, authenticated actor ID/role, affected student or resource, action, outcome, reason where required, correlation ID, and non-sensitive changed-field values. Keep event time separate from client-reported time. Logs must never include passwords, password hashes, access tokens, session secrets, or full private query/answer contents [S8]. For password edits, log only “password reset by Teacher X for Student Y.”

Use append-only database permissions for application roles; users cannot edit or delete events. Security-critical staff mutations and their audit entry commit together or fail. Export restricted copies for durability, and monitor audit failures. Do not claim absolute tamper-proofing against infrastructure administrators. Administrators can search school logs; teachers see their permitted actions/students; students can see their own account-security history. Owner security investigations require explicit scoped authorization and an audit event.

Proposed retention: audit metadata for 12 months, configurable after school agreement. Minimize IP/user-agent collection, restrict access, and use a shorter documented retention where possible. Password values are excluded regardless of retention.

### FR-19 — “Teacher logs in/out of a student” interpretation

Ordinary staff support should happen through the teacher's own account: reset password, edit authorized profile fields, and force a student logout. These actions clearly record the teacher as actor. Logging in with a student's password would otherwise look like the student, so it cannot reliably meet the requested attribution.

Recommended MVP support mode is an explicit **View student dashboard** session: recent staff authentication, reason, visible support banner, maximum 15-minute duration, and start/end audit events with both actor and subject. Read-only view only; it cannot start an exam, answer or submit it, send a query as the student, or change grades. Password resets and profile edits use the separately audited staff APIs. The student can see that a support session occurred.

This is a proposed interpretation, not approval for invisible impersonation. If full interactive impersonation is wanted, it requires a separate permission and design decision. Browser crashes do not reliably emit logout; record server session expiry instead of fabricating a logout event.

## 22. Timed-exam integrity and fraud controls

### FR-20 — Threat/control matrix

| Risk | Required control | Practical limit / review rule |
|---|---|---|
| Clock manipulation or late answers | Server deadline; reject saves after deadline; finalize persisted answers | Client timer is display only |
| Multiple starts, devices, or replayed submissions | Unique attempt, idempotency, revision checks, one active writer lease | Device takeover requires re-authentication and invalidates old writer; server deadline is unchanged |
| Looking up another student's exam | Recipient checks and tenant/ownership enforcement | UUID secrecy is not authorization |
| Viewing keys in browser/API | Separate protected key storage and explicit student payloads | Check network responses as well as UI |
| Copying nearby students | Optional section-wise question and eligible MCQ option shuffle | Persist per-attempt order; do not shuffle “all of the above”/order-dependent options |
| Pair/option scoring mismatch after shuffle | Store stable option/pair IDs; grade by ID | Never score from displayed letter/position |
| Leaving exam screen | Page-visibility/fullscreen-exit events and a clear warning | Advisory, client-reported, bypassable; not proof of cheating [S9] |
| Browser tools or modified frontend | Validate all state and scoring on the server | Disabling right-click or developer tools is not a security boundary |
| AI/chat/call help | Disallow Papperly group/query/support write actions while a student's attempt is active | Other websites, phones, paper notes, and people cannot be reliably blocked by a normal web app |
| Credential sharing/guessing | Strong credentials recommended; rate limits; active-writer rules; optional teacher start code | Name/roll passwords weaken identity assurance; a shared school IP is not proof of collusion |
| Staff tampering | Audited permissions, immutable versions, grade revisions, support-mode restrictions | Authorized human review remains necessary |
| Connectivity loss | Save acknowledgements, visible unsynced state, reconnect before deadline | Unsynced work cannot be accepted after expiry merely from a client timestamp |

Exam duration supports 60- and 120-minute tests and custom positive durations within the 12-hour session policy. Opening/closing window and duration are distinct. If late starts are allowed, show the reduced time before start; alternatively teacher can set a last-start cutoff so students receive the full duration. This setting is frozen on publication.

Optional teacher-issued start codes open a scheduled exam but do not replace student login. Code changes apply only before attempts begin. Extra-time accommodations must be assigned per recipient before starting and reflected in a permitted recipient closing time; they are audited and do not modify other students' deadlines.

### FR-21 — Integrity review policy

Show students the configured integrity rules before they start. Collect only relevant events, timestamps, attempt identity, and server receipt time. Missing browser telemetry is not proof of wrongdoing. Focus loss, refresh, disconnection, fullscreen exit, and assistive technology use must not automatically deduct marks or terminate an attempt. An optional threshold can mark **Needs review**; proposed default is three visibility-loss events, with no automatic penalty.

Teacher sees the event timeline, student explanation, and relevant saved-answer timestamps. Review outcomes: Cleared, Warning, or Invalidated with reason. Invalidating a submitted attempt preserves its answers and grade history and notifies the student with an appeal route to the school administrator. Never auto-fail from an AI-generated suspicion score. No webcam or screen recording in the MVP.

For an infrastructure outage, preserve saved answers and an incident record. The teacher may schedule a new exam/version or an explicitly authorized replacement attempt under a documented exception; never silently reopen a finalized attempt or erase the first attempt. Strict physical supervision remains the school's responsibility for high-stakes exams.

## 23. Version 1 architecture, delivery gates, and verification

### Additional data entities

| Entity | Key fields / constraints |
|---|---|
| student_registry / enrollments | Immutable student UUID; optional admission number; academic-year roster uniqueness |
| login_identifiers / identifier_history | Case-normalized unique school login; old IDs reserved; immutable Auth mapping |
| import_jobs / import_rows | Actor, checksum, idempotency key, state, conflict, provisioning recovery |
| groups / group_memberships | School, year/class/subject, responsible teacher, membership state and history |
| posts / post_revisions | Author, group, text, pin, timestamps, deletion marker |
| attachments | Owner context, private object key, type, size, checksum, scan state, quota status |
| query_policies | Teacher, subject/group, duration, policy version |
| queries / query_messages | Student, teacher, topic, context, state, submission time, private replies |
| query_cycles / deadline_revisions | Original/current deadlines, first response, delivered solution, reason, old/new values |
| notification_events / deliveries | Recipient, event key, scheduled time, read state, deduplication key |
| support_sessions | Actual actor, subject, reason, expiry, read-only scope |
| integrity_events / reviews | Attempt, client/server times, event type, teacher outcome, appeal |
| attempt_leases / accommodations | Active writer, expiry, per-recipient duration/window override |

All new entities use school-scoped RLS and API checks. Private messages cannot be read through a group membership alone. Attachment reads inherit their current parent-resource permissions. Membership deletion revokes access even when a notification still exists.

Use the existing Cloudflare Worker API and Supabase database; add no separate community database. A scheduled Worker process evaluates due queries and exam expiry, writes durable notification/outbox events, and retries failures. Queues handle file processing, import work, and AI jobs with separate job types, retries, and deduplication. Persist transitions before sending notifications. R2 stores private files; Postgres stores metadata. No live video infrastructure is needed yet.

### Updated dashboards and prototype

Teacher navigation: Dashboard, Students/Import, Student Reports, Questions, Exams, My Groups, Queries, My Teacher Profile, My Articles, and Account Activity. Student navigation: My Dashboard, My Exams, My Groups, My Queries, My Progress, Teachers, Notifications, and Account Settings. Administrator adds Student Registry, Student Reports, School Analytics, Import History, Group Ownership, Query Deadlines, Teacher Profiles/Articles, and Audit Logbook. Student access to groups/queries is suspended during an active attempt, with a clear return path after finalization.

Add prototype fixtures for Class 9B Computer Science; a teacher announcement with a sample PDF; pending/approved/removed memberships; queries with 24-hour and seven-day deadlines; an overdue query and extension notification; duplicate Excel import; username edit; credential-reset log; advisory exam alert. All fixtures are synthetic and simulated. Retain the original 25-mark mixed-format paper.

### Version 1 delivery gates

1. **A — Reviewable prototype:** complete all role screens and new fixtures without real accounts or AI calls.
2. **B1 — Identity and roster:** real role permissions, shared registry, Excel preview/import/recovery, credential changes, audit logs, and support view. Confirm Section 24 credential choices before production provisioning.
3. **B2 — Exam engine:** server timing, recovery, recipient/version rules, shuffling, writer lease, accommodations, objective scoring, and integrity review.
4. **B3 — AI assistance:** question conversion, rubric suggestions, quotas, failure/manual fallback, and teacher publication.
5. **B4 — Learning support:** approved groups, scanned private files, query routing, deadline revisions, in-app notifications, and overdue monitoring.
6. **B5 — Dashboards and teacher directory:** student/school analytics, automatic improvement guidance, profile management, search, and article publication.
7. **B6 — Integrated Version 1 pilot:** performance, privacy, recovery, onboarding documentation, and acceptance evidence across two schools for every module.

### Additional acceptance tests

- [ ] Two teachers importing the same roster concurrently create one student per verified identity; no automatic password reset occurs.
- [ ] Retry after Auth provisioning failure resumes safely without orphan active accounts or duplicated quota charges.
- [ ] Same-roll/different-name conflicts require review; matching names alone never cause a merge.
- [ ] Student username/password changes preserve submissions and groups; the staff dashboard shows current ID and change metadata.
- [ ] Selected password case policy behaves identically on create, sign-in, change, and reset; staff accounts remain case-sensitive.
- [ ] Student is not forced to change credentials on first login.
- [ ] Audit actor remains the teacher during reset, forced logout, or support view; support mode cannot submit an exam or query.
- [ ] Pending/removed/cross-school members cannot read group posts or attachments through direct URLs.
- [ ] Students cannot post, comment, react, or reply inside announcement groups even through direct API calls.
- [ ] Student private queries cannot be read by another student or an unassigned teacher.
- [ ] A 24-hour query and a 168-hour query calculate exact deadlines, including weekends, in the correct timezone.
- [ ] Changing a policy affects only new queries; individual changes retain history and notify the student.
- [ ] Teacher acknowledgement does not mark a query resolved; student clarification preserves the original cycle.
- [ ] Reminders are deduplicated and cancelled/rescheduled after relevant changes; overdue metrics cannot be erased by extensions.
- [ ] Malicious/unsupported files stay quarantined; revoked membership blocks existing attachment links.
- [ ] Shuffle remains stable on refresh and does not change correct-answer mappings.
- [ ] Visibility loss creates an advisory event without automatically failing or submitting the exam.
- [ ] Another active writer cannot silently overwrite answers; takeover does not reset time.
- [ ] Group/query APIs reject use during the student's active attempt; existing private threads remain intact afterward.
- [ ] Subscription expiry blocks new student imports, group posts, and queries, but permits reading existing content and finishing already-open query responses/exam reviews. Security suspension remains an immediate separate action.
- [ ] Logs and exports contain no passwords/tokens; the only permitted credential export is a newly issued one-time credential sheet, which is never part of audit exports.

### Product metrics and capacity

Retain the 50-concurrent-examinee pilot target. Also measure duplicate accounts prevented, import failures/recovery, successful private downloads, query first-response time, original/revised target adherence, overdue unresolved work, teacher corrections to AI marks, and false-positive integrity reviews. These measure service quality; subject workloads must not be ranked without context.

Budget now includes document storage, scanning, import processing, and scheduled jobs as well as AI. Configure per-school file/storage, active-user, and AI limits; distinguish AI quota exhaustion from an exam outage. File/AI job load must not starve exam answer saves. Test mixed workload during the pilot.

## 24. Decisions and research references

### Decisions that remain explicit

| Decision | Current document position | When needed |
|---|---|---|
| Application name | Confirmed: Papperly | Now |
| Username example | Provisional Ujjawal.9B15; user also stated Ujjawal.9B | Before real import generation |
| Initial student password | Requested Ujjawal9B15; unpredictable passphrase recommended | Before real student pilot |
| Password casing | Requested student-only case-insensitive mode; case-sensitive recommended | Before Auth implementation is finalized |
| Existing password visibility | Requested; reset-only recommended and specified as baseline | Before production credential screens |
| Teacher access scope | Any school teacher may create/reuse; full edits/resets need assignment/delegation | Before permissions implementation |
| Staff student login | Read-only attributed support view proposed; no invisible impersonation | Before support feature |
| Query targets | Teacher-defined elapsed hours, snapshot per query, audited changes | Default adopted for draft |
| TA | Teaching assistant assumed; live calls future | Before call feature |
| Operating details | AI model, scanning provider, monthly budget, subscription prices, retention agreement | Before real-data deployment |

The unresolved credential choices do not block prototype work. This PRD does not silently replace the requested behavior with an approved security policy. Confirm those few choices before implementing real account provisioning. No application changes or deployment are part of this document update.

### Additional sources checked on 7 November 2026

- **[S5] OWASP Authentication Cheat Sheet:** password strength, rate limiting, and secure authentication guidance. [Official guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
- **[S6] OWASP Password Storage Cheat Sheet:** password hashing rather than plaintext/recoverable storage. [Official guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- **[S7] OWASP File Upload Cheat Sheet:** layered validation, permissions, size constraints, and safe storage. [Official guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
- **[S8] OWASP Logging Cheat Sheet:** event attribution and exclusion of passwords/tokens from logs. [Official guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).
- **[S9] MDN Page Visibility API:** visibility/focus events describe browser state; Papperly's advisory-only interpretation is a design judgment based on those limitations. [Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
- **[S10] Cloudflare R2:** object storage and Worker integration; scanning and membership authorization remain application responsibilities. [Documentation](https://developers.cloudflare.com/r2/).

The exact quotas, reminder intervals, username convention, deadline semantics, support-session length, and release gates are product recommendations, not claims that the cited sources mandate them.


## 25. Student dashboard and automatic improvement guidance

### FR-22 — A personal student home

After explicit login, the student lands on **My Dashboard**, scoped to their own school and immutable student identity. It brings together their groups, released results, solved queries, and learning progress without exposing another student's records.

| Dashboard area | Required content | Primary action |
|---|---|---|
| My groups | Active memberships, subject/teacher, unread post counts | Open a selected group |
| My exams | Upcoming, available, ongoing, submitted, and results pending | Start/resume or view receipt |
| Recent results | Teacher-published scores, subject, date, feedback | Open own result |
| My queries | Open/due/answered/resolved counts; recent solved questions | Read solution or raise a query |
| My progress | Subject/topic trends, completion and accuracy summaries | Open detailed progress report |
| Improvement guidance | Automatic AI learning suggestions grounded in released evidence | View supporting results and suggested next step |
| Notifications | Assignment, group, query, deadline, result, account changes | Open authorized destination |

Each area has a clear empty state, loading state, and retry state. Do not show invented marks, zero averages for missing data, or simulated AI insights in the live application. Show last updated time and active filters. During an active exam, open the attempt workspace; the dashboard and learning resources cannot serve as an in-app source of exam assistance. Normal access resumes after finalization.

Solved queries remain searchable by subject, topic, teacher, and date, allowing students to revisit the explanation. A searchable solved-query archive is private to that student, not a public question bank. It does not alter group commenting restrictions.

### FR-23 — Reliable learning statistics

Use approved, published marks as the source of truth. Do not expose draft grades, unreleased keys, private staff notes, or grading suggestions through a dashboard or AI report. Maintain teacher-approved subject/topic tags on questions, with an optional skill tag. AI can suggest tags during authoring, but the teacher confirms them before publication. Untagged questions appear under Unclassified rather than being assigned an invented topic.

| Metric | Definition / rule |
|---|---|
| Exam percentage | Awarded published marks ÷ maximum applicable marks × 100 |
| Subject/topic attainment | Sum of published marks earned ÷ sum of applicable maximum marks for the selected subject/topic; display sample count and date range |
| Objective accuracy | Correct objective scoring units ÷ answered objective scoring units; blank/pair units use their configured scoring units; show unanswered separately |
| Completion rate | Finalized attempts ÷ eligible assigned exams that have closed in the selected period; exclude cancelled/exempted assignments |
| On-time submission | Finalized by the student's authorized deadline, including approved accommodations; report separately from score |
| Score trend | Published exam percentages over time with exam labels; compare like subject/class/assessment contexts and disclose difficulty differences |
| Attempt duration | Finalization time minus start time, capped at the allowed window; includes idle/network time and is not a direct measure of learning speed |
| Query history | Submitted, answered, resolved, reopened, and overdue counts; asking more questions is not treated as weakness |

Show both weighted totals and individual exam results; do not silently average percentages with different maximum marks. Multiple topic tags must not double-count a question in overall totals: use one primary topic in Version 1, with secondary tags as filters only. Describe partial-credit treatment. Denominators exclude unpublished/ineligible results. Keep per-exam curriculum tags so subject/class promotion does not rewrite historical statistics.

**Pace** means a contextual view of progress across assessments, submission patterns, topic coverage, and query follow-through. It is not an intelligence score or a diagnosis. Do not infer low ability from slow typing, inactivity, accommodations, or internet problems. No public student ranking or automated high-stakes decision is generated.

Proposed evidence threshold: one result can receive a result-specific review; a trend label requires at least two comparable assessments; a recurring topic-improvement suggestion requires at least three scored units across two assessments. Otherwise show **More evidence needed** and a limited, labelled observation. These thresholds are product defaults, not scientific claims.

### FR-24 — Automatic AI guidance

When the teacher publishes a result or revises a published grade, queue an insight refresh for the affected student. The dashboard automatically shows validated guidance without requiring the student to request an AI response. The teacher's approval of marks remains mandatory; these low-stakes study suggestions do not require a separate manual approval every time, but teachers can correct or suppress them.

Input is a minimal school-scoped evidence summary: released scores, approved topic tags, applicable released feedback, comparison period, and approved resource references. Do not include names, login IDs, other students' data, unreleased answer keys, private query text, or staff notes by default. Solved query topics can inform a suggestion only when permitted; asking a query must not automatically reduce a performance measure.

Output schema:

1. Evidence period and source result IDs.
2. Up to three strengths with supporting observations.
3. Up to three topics to practise, with supporting observations.
4. A concrete next action for each topic, such as revising a named concept or reading an approved group document.
5. An evidence sufficiency label and last generated timestamp.

The server calculates all numeric values; AI describes them and proposes learning actions. Validate the output schema, referenced resources, and access rights. Any displayed number must come from the supplied metrics. Do not invent completed work, grades, learning disabilities, emotional states, or promises of improvement. Treat student/teacher text as untrusted data and prevent it from overriding generation instructions.

Use supportive wording: “Practise loop conditions; two recent questions were missed” instead of “You are weak in programming.” AI suggestions cannot alter marks, discipline a student, grant group access, or automatically create graded homework. Suggested links must point only to currently authorized published content; if no suitable resource exists, provide a plain-language practice step rather than fabricate a link.

Keep model/prompt version, evidence fingerprint, and generation status. Deduplicate jobs per evidence version. Grade correction/deletion invalidates old insights immediately; show **Updating** until replacement guidance is ready. A delayed job for an older version cannot overwrite newer insights. Teachers can flag misleading guidance and record a correction; retain that correction so retries do not silently restore the same advice.

If the AI service fails, quota is exhausted, or evidence is insufficient, keep deterministic stats available and show a specific status. AI is never on the answer-save or exam-submission critical path. Suggested pilot target: guidance available within five minutes of result publication under normal load; measure it rather than promise it as an SLA. Retain one current visible insight snapshot and an audited, access-controlled revision history under the school's retention rules.

## 26. School and teacher student-progress reports

### FR-25 — Individual and aggregate reporting

School administrators can maintain a longitudinal report for every student in their school: enrollment history, assigned/completed exams, published scores, subject/topic summaries, feedback, query status/solution history metadata, group membership, and improvement guidance. Individual progress access is included; it is no longer restricted to aggregate school counts.

Assigned teachers can view their students' progress in their authorized subjects/classes and manage teaching feedback. Cross-subject access requires explicit school delegation. Students see only their own released information. Platform owner receives service/usage aggregates, not routine access to identifiable academic reports.

| View | Filters and content |
|---|---|
| School overview | Academic year, class, section, subject, date period; participation, published attainment, and query-target adherence |
| Class/subject report | Student list, published scores, missing submissions, topic-level evidence and data sufficiency |
| Student report | Historical timeline, published results, subject trends, completed queries, teacher feedback, and AI suggestions |
| Support follow-up | Students with evidence-based practice suggestions, missing submissions, or overdue learning queries; no automatic punitive labels |
| Export | Authorized CSV summary and printable report with school, filters, generation timestamp, source period, and clear AI labels |

Reports use the formulas in FR-23. Missing submissions, missing marks, and zero scores are distinct states. Separate exams of different classes, curricula, or difficulty when comparing progress. A report can identify an area for teacher attention; it cannot establish the cause without human review.

School administrators can correct roster/subject mappings through audited workflows but cannot silently overwrite a teacher's final marks via a reporting screen. Grade corrections use the existing marking/republication workflow. Teacher-only support notes are stored separately from student-visible feedback and are excluded from automatic student AI summaries.

Private query contents remain restricted under FR-15. School reports include subject, state, deadline, and resolution timestamps by default; accessing private message bodies still requires the separate audited permission. Viewing a progress report does not automatically grant permission to read all raw answers, credentials, or private conversations.

### FR-26 — Updates, export, and retention

- Recalculate statistics when results are published/revised, an assignment is cancelled/exempted, or enrollment/topic mappings are corrected. Preserve the historical record of changes.
- Provide academic-year/term filters, a clear last-refresh time, and drill-down to authorized supporting results. Server-side aggregations remain tenant-scoped.
- Cache summaries by school, user/access scope, filters, and source-data version. Recheck authorization on access; do not share a cached student report across users or schools.
- CSV exports neutralize formula-like cells. Printable/CSV reports contain only fields the requester may view and never contain passwords or secrets. Log who exported which scope and when.
- Store any prepared report files privately with a short proposed 24-hour download lifetime, then delete them. A downloaded copy cannot be remotely revoked; make its sensitive scope clear.
- Preserve academic history across class changes using the same student UUID. After account deactivation, authorized staff may retain reports under the agreed retention policy; deactivation is not deletion.
- School-approved deletion/retention actions also purge or invalidate derived aggregates, insight caches, private exports, and search entries. A backup-restoration procedure must reapply deletion records.

## 27. Teacher search, profiles, and educational articles

### Interpretation of the teacher-search request

The sentence “shouldn't show the profile” conflicts with the following detailed request for searchable teacher profiles. This PRD follows the detailed intent: **students search for a teacher and deliberately open that teacher's profile**. It is a directory search, not a web search engine or a scrolling social network. Public visibility outside the school is a separate setting described below, not an automatic exposure of school data.

### FR-27 — Search and discovery

- Provide a **Teachers** page with a search box and filters for teacher name, subject, and class taught. A result card shows approved display name, subject, school-approved photo, short bio, and an **Open profile** action.
- Default scope is the student's school. Show only directory-visible, active/approved profiles. No public student search and no searchable student profiles.
- Search is explicit, bounded, and paginated. Order by name relevance then alphabetical order; do not rank by likes, ratings, student scores, followers, or time spent.
- Search results cannot expose private profile fields, draft articles, internal statistics, student names, or private groups. Reauthorize every result/detail request and scope caches correctly.
- Opening a profile provides organized tabs/sections, not an endless feed. Searching teacher names and public article metadata is enough for Version 1; vector search or an external search service is unnecessary.
- Disabled/deleted/unpublished profiles disappear from results and caches. Stale links return an unavailable message. Limit and rate-limit broad directory enumeration.

### FR-28 — Teacher profile structure and statistics

| Profile section | Content | Ownership / visibility |
|---|---|---|
| Identity | Display name, approved photo, designation, school, subjects/classes | School-controlled authoritative fields |
| About | Biography, teaching approach, qualifications and experience | Teacher drafts; school reviews public claims |
| Recent development | Approved workshops, certifications, projects, resources, and professional updates with dates | Teacher or school submits; no invented achievements |
| Articles / blog | Published teaching articles and approved attachments, with title/topic/date | Teacher authors; school moderation rules apply |
| Teaching activity | Approved counts such as published articles/resources and completed workshops | Safe profile statistics; definition and period displayed |
| Internal teaching report | Assigned groups/classes, exam activity, aggregate query response/solution times | Teacher and authorized school administrators only |
| Contact / query action | School-approved contact information or **Ask my teacher** for eligible students | Never reveal personal phone/email by default; query routing still requires assignment |

The school maintains the teacher directory, factual employment/assignment fields, visibility, and publication policy. Teachers can preview their public-facing profile without gaining permission to publish private fields. Teachers can edit their own biography drafts, professional updates, and articles; they cannot alter their role, verified qualifications, another teacher's profile, or school-level permissions.

Statistics are factual descriptions, not ratings. Counts must be derived from eligible records, excluding drafts/deleted items, and labelled with the date range and last refresh. Never publish student-level marks, student names, private queries, comparative “best teacher” scores, star ratings, or leaderboards. Student performance and internal response metrics do not become public profile fields by default. Profile visitors cannot rate, comment, react, follow, or send unsolicited direct messages.

### FR-29 — Article authoring and publication

Article fields: author, title, summary, subject/topic, body, approved attachments, intended audience, timestamps, review state, and revision history. Use a restricted rich-text/Markdown editor with sanitized rendering. Apply FR-11 to uploaded documents and images. Do not expose private group attachments by copying their URLs into a public article; a public article needs a separately approved publication asset.

States: **Draft → Submitted for review → Published**, or **Changes requested**, then **Archived/Unpublished**. Teacher can draft and submit their own material. School administrators can publish/unpublish and edit with attribution. The school may grant an audited trusted-publisher permission for direct publication to a designated audience; default is school review before publication, especially for internet-public content.

Editing a published article creates a draft revision. The previous approved version remains visible until the revision is approved, unless the author/school immediately unpublishes it. Preserve authorship and editor history. Deactivating a teacher removes active directory access; the school chooses whether to retain approved articles with an “Archived author” label or unpublish them. The teacher no longer has editing rights after deactivation.

### FR-30 — Audiences and absence of social-feed features

Three distinct boundaries:

1. **Private group material:** approved group members only, managed under Section 18.
2. **School-visible profile/article:** logged-in members of the same school; default for Version 1.
3. **Internet-public profile/article:** optional, explicitly school-enabled and approved for each profile/content item. Visitors can read only approved public fields and articles without signing in. Public URLs do not grant app accounts or access to private school content.

“Publicly readable” therefore does not mean private school data becomes public. Public search, if enabled, returns only explicitly public teacher profiles/articles. Search-engine indexing is off by default until the school explicitly enables it; robots/noindex settings are not access control. Use authorization for school-only pages. Public assets must also follow the selected audience. Changing content to private must purge public caches and disable public asset access; acknowledge that prior external downloads/search-engine copies may persist.

There is **no global social feed, infinite scrolling, comments, ratings, likes, reactions, followers, popularity ranking, or public student posting**. Normal page scrolling for reading a long article is allowed; it is not feed discovery. Profile article lists and group post lists use pagination. Articles are read by visiting a specific teacher profile or a direct authorized link. No automatic mass notification of every teacher article; assigned groups may link to approved articles using their existing post workflow.

Teacher directory links during an active exam are restricted alongside group/query features; ordinary public websites outside the application cannot be blocked by this restriction. Profile publication never grants the teacher permission to see an unassigned student's information.

## 28. Complete Version 1 integration and acceptance

### Additional architecture and data requirements

Keep the agreed React/TypeScript, Cloudflare Workers, Supabase PostgreSQL/Auth, private R2, Queues, and GitHub stack. Implement teacher-directory keyword search with tenant-scoped database queries/indexes; no new search-engine infrastructure is required. This is a design recommendation, not a claim about vendor-specific automatic search features.

| Entity | Purpose and key constraints |
|---|---|
| curriculum_topics / question_topic_tags | Teacher-approved subject/topic metadata, primary tag, versioned exam linkage |
| progress_snapshots | Student UUID, school, period, filters, source-result version, calculated metrics |
| student_insights / insight_jobs | Evidence references/fingerprint, model/prompt version, status, correction, visibility |
| teacher_feedback / support_notes | Explicit student-visible feedback vs restricted internal notes |
| report_exports | Actor, permitted scope, filters, generation time, private object, expiry |
| teacher_profiles / profile_revisions | School, teacher, authoritative fields, draft/published versions, audience/status |
| professional_updates | Workshop/project/certification, date, evidence reference, approval state |
| teacher_articles / article_revisions | Author, topic, body, audience, moderation state, revision history |
| content_publications / public_assets | Explicit published audience, approved asset copies, revocation/cache-purge state |

Use RLS, authenticated API permissions, and audience-specific projections across all new entities. Never expose an internal teacher statistics object and merely hide selected fields in the frontend. Separate public profile DTOs from internal records. Aggregate metrics are access-controlled data even when they contain no direct names.

Trigger analytics from durable publication/correction events using the existing outbox. Run aggregate calculation and AI generation asynchronously with version checks. A slow report/export must not block exam saves. Audit profile changes, audience changes, article approvals, insight corrections, and report exports. Limit per-school insight generation separately within the overall AI budget and cache unchanged evidence.

### Version 1 demonstration dataset

Extend—not replace—the existing hard-coded exam, group, import, and query fixtures:

- A student home containing groups, published results, solved/open queries, and improvement suggestions.
- Three published assessments across two subjects, including a topic trend and a clearly insufficient-evidence case; all fictional and internally consistent.
- A school report with class/section filters, a student detail report, and an assigned-teacher restricted view.
- Two teacher profiles with About, professional updates, safe statistics, and articles; one draft/unpublished profile and one disabled teacher for access tests.
- School-only and optional public article examples; no comments, ratings, or social feed controls.
- Grade-correction/insight-updating, AI-unavailable, no-results, no-group, no-query, empty-search, unpublished-content, and access-denied states.

All prototype AI suggestions and statistics are labelled synthetic/demo data. Real calculations and automatic insight generation arrive in the working Version 1 implementation.

### Dashboard, analytics, and profile acceptance tests

- [ ] Student dashboard shows only the signed-in student's groups, results, queries, and progress, including when IDs are tampered with.
- [ ] Unpublished results, answer keys, and staff notes cannot leak through analytics, AI guidance, exports, or caches.
- [ ] Metric tests verify weighted totals, partial-credit units, unanswered items, exemptions, cancelled exams, and insufficient-evidence states.
- [ ] Published grade changes invalidate stale reports/insights; delayed old jobs cannot overwrite newer calculations.
- [ ] AI guidance is automatic after publication, cites authorized evidence, invents no numbers, and remains separate from grades.
- [ ] AI outage/quota exhaustion leaves deterministic reports usable; teacher corrections are retained across retries.
- [ ] School administrator sees individual own-school reports; assigned teachers see only their authorized students/subjects; other schools are denied.
- [ ] Student promotion/username change preserves the same report history; retention/deletion removes derived caches and exports appropriately.
- [ ] Query counts are not used as a negative ability indicator, and time spent is not presented as an intelligence measure.
- [ ] Reports have clear periods, filters, last-refresh timestamps, and authorized export scope.
- [ ] Teacher search is school-scoped by default and returns only approved visible profiles; no student profiles are indexed.
- [ ] Profile statistics match published eligible data and never reveal student-level/private records or ratings.
- [ ] Teachers cannot publish to the internet or bypass school review without the relevant explicit permission.
- [ ] Draft revisions remain hidden; unpublishing removes search/cache visibility and blocks the associated unauthorized asset paths.
- [ ] School-only profile/article links deny anonymous and cross-school access; optional public links expose only explicitly approved fields/assets.
- [ ] There are no comments, ratings, reactions, followers, popularity ranking, or infinite-scroll/feed interfaces or write APIs.
- [ ] Private query conversations still allow student clarification; removing public comments does not remove the private query workflow.
- [ ] Mixed-load testing covers 50 active examinees alongside dashboards, imports, file jobs, and analytics without breaking the existing answer-save target.

### Full requirement traceability

| Requirement discussed | Version 1 location |
|---|---|
| Owner, schools, subscription access, role hierarchy | Sections 1–4; FR-01–03 |
| Explicit login, no public signup, account/reset/session controls | FR-01; Sections 19 and 21 |
| AI formatting and all objective/subjective question types | Sections 5–7; FR-04–07 |
| Timed exams, assignments, autosave, expiry, submissions | FR-05–06; Section 22 |
| Objective checking, AI subjective suggestions, teacher-reviewed results | FR-07–08 |
| Hard-coded paper before real services | Section 12; Sections 23 and 28 demo fixtures |
| Cloudflare, Supabase, GitHub, CI, data model | Sections 8–10, 14, 23, and 28 |
| Teacher-controlled groups, messages, documents, membership | FR-09–11 |
| Shared student accounts, Excel import, duplicates | FR-12–14 |
| Name/class/roll credentials, case preference, optional later changes | Section 19; explicit decision register in Section 24 |
| Private queries, teacher-set deadlines, extensions, solutions | FR-15–17 |
| Future teacher/TA calls | Section 20, future scope only |
| Staff edits, password-reset logs, attributed support access | FR-18–19 |
| Fraud prevention, advisory signals, human review | FR-20–21 |
| Student dashboard with groups/results/solved queries | FR-22 |
| Automatic improvement guidance and progress statistics | FR-23–24 |
| School and teacher individual student reports | FR-25–26 |
| Teacher search, profile, About, developments, statistics, blog | FR-27–29 |
| School management, teacher publishing, public/readable audience | FR-28–30 |
| No social feed, comments, ratings, or popularity features | FR-10 and FR-30 |
| Testing, security, release gates, risks and unresolved decisions | Sections 13–16 and 21–24; Section 28 |

All thirty functional requirement groups form **Papperly Version 1**. Existing credential ambiguities remain explicitly unresolved rather than silently discarded. The school-visible directory is the default; external-public publication requires an explicit school setting and approved content. Earlier requested behavior, security recommendations, and future features remain distinguishable within this single document.

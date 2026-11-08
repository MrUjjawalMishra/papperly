import process from "node:process";
import console from "node:console";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { TextEncoder } from "node:util";
import { URLSearchParams } from "node:url";
import { adminClient, bootstrapOwner } from "./bootstrap-owner.mjs";
import { rosterTemplate } from "../packages/domain/src/imports.ts";
import {
  canonicalPassword,
  STUDENT_POLICY,
} from "../packages/domain/src/credentials.ts";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

const target = JSON.parse(
  readFileSync("docs/staging-release-target.json", "utf8"),
);
const base = `https://${target.worker}.${target.workersSubdomain}.workers.dev`;
const tag = randomUUID().slice(0, 8),
  prefix = `Synthetic live ${tag}`;
const count = Number(process.env.STAGING_LOAD_STUDENTS ?? 50);
if (
  process.env.GITHUB_REPOSITORY !== target.repository ||
  !Number.isInteger(count) ||
  count < 2 ||
  count > 50
)
  throw Error(
    "Verified staging repository and 2–50 synthetic students required",
  );
const admin = adminClient(
  target.supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
);
const report = {
  environment: "staging",
  base,
  tag,
  sourceCommit: process.env.GITHUB_SHA,
  startedAt: new Date().toISOString(),
  checks: [],
  resources: { schools: [], users: [] },
  passed: false,
  cleanup: {},
};
mkdirSync("work", { recursive: true });
const save = () =>
  writeFileSync(
    "work/staging-acceptance.json",
    JSON.stringify(report, null, 2) + "\n",
  );
const ensure = (ok, message) => {
  if (!ok) throw Error(message);
};
async function step(name, fn) {
  const start = performance.now();
  try {
    await fn();
    report.checks.push({
      name,
      passed: true,
      durationMs: Math.round(performance.now() - start),
    });
    console.log("PASS", name);
  } catch (error) {
    report.checks.push({ name, passed: false });
    throw error;
  } finally {
    save();
  }
}
class Client {
  cookie = "";
  csrf = "";
  password = "";
  userId = "";
  loginId = "";
  schoolCode = "";
  role = "";
  dbJwt = "";
  async request(path, body, expected = 200, options = {}) {
    const headers = {
      Origin: base,
      ...(this.cookie ? { Cookie: this.cookie } : {}),
      ...(this.csrf ? { "X-CSRF-Token": this.csrf } : {}),
      ...options.headers,
    };
    const binary = body instanceof Uint8Array;
    if (body !== undefined && !binary)
      headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers,
      redirect: "error",
      body:
        body === undefined ? undefined : binary ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const isJson = response.headers
      .get("content-type")
      ?.includes("application/json");
    const data = isJson ? await response.json() : await response.text();
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (!allowed.includes(response.status))
      throw Error(
        `${path.split("?")[0]}: expected ${allowed.join("/")}, received ${response.status}; code ${/^[A-Z_]+$/.test(data?.error?.code ?? "") ? data.error.code : "UNREPORTED"}`,
      );
    if (data?.csrfToken) this.csrf = data.csrfToken;
    if (data?.data?.csrfToken) this.csrf = data.data.csrfToken;
    return { data, status: response.status, headers: response.headers };
  }
  async call(path, body, expected = 200) {
    return (await this.request("/v1/" + path, body, expected)).data?.data;
  }
  async login(owner = false, password = this.password, expected = 200) {
    let r;
    for (let attempt = 0; attempt < 8; attempt++) {
      r = await this.request(
        owner ? "/v1/auth/owner-login" : "/v1/auth/login",
        {
          schoolCode: this.schoolCode || "platform",
          loginId: this.loginId || "owner",
          password,
        },
        expected === 200 ? [200, 429] : expected,
      );
      if (r.status !== 429) break;
      report.authSetupRateLimitsObserved =
        (report.authSetupRateLimitsObserved ?? 0) + 1;
      if (attempt === 7)
        throw Error("Auth setup remained rate-limited after bounded retries");
      await delay(
        Math.min(
          30000,
          Math.max(1000, Number(r.headers.get("retry-after") ?? 3) * 1000),
        ),
      );
    }
    if (expected === 200) {
      this.userId = r.data.user.id;
      this.role = r.data.user.role;
    }
    return r;
  }
  async changePassword() {
    const next = "ChangedStaff" + randomBytes(24).toString("base64url");
    const old = this.cookie;
    const r = await this.request("/v1/auth/password", {
      userId: this.userId,
      currentPassword: this.password,
      newPassword: next,
      reason: "Synthetic first-login verification",
    });
    ensure(
      this.cookie !== old &&
        r.headers.get("set-cookie")?.includes("HttpOnly") &&
        !r.data.data._cookie,
      "Password change did not replace protected session cookie",
    );
    this.password = next;
    const stale = new Client();
    stale.cookie = old;
    await stale.request("/v1/auth/session", undefined, 401);
    await this.request("/v1/auth/session");
  }
}
async function ordinaryDataApi(client, path, body, expected = [200]) {
  const response = await fetch(target.supabaseUrl + "/rest/v1/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      apikey: target.supabasePublishableKey,
      Authorization: `Bearer ${client.dbJwt}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  ensure(
    expected.includes(response.status),
    `Ordinary Data API ${path.split("?")[0]} returned unexpected status ${response.status}`,
  );
  return {
    status: response.status,
    data: await response.json().catch(() => null),
  };
}
async function ordinaryToken(client) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetch(
      target.supabaseUrl + "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        headers: {
          apikey: target.supabasePublishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: `${client.userId}@${target.authAliasDomain}`,
          password: canonicalPassword(
            client.password,
            client.role,
            client.role === "student" ? STUDENT_POLICY : "case-sensitive-v1",
          ),
        }),
        signal: AbortSignal.timeout(20000),
        redirect: "error",
      },
    );
    if (response.status === 429 && attempt < 7) {
      await delay(3000);
      continue;
    }
    ensure(response.ok, "Ordinary-user Auth token acquisition failed");
    const data = await response.json();
    ensure(
      typeof data.access_token === "string" && data.user?.id === client.userId,
      "Ordinary-user Auth identity mismatch",
    );
    client.dbJwt = data.access_token;
    return;
  }
  throw Error("Ordinary-user Auth setup remained rate-limited");
}
const clients = [];
let ownerId = randomUUID();
const owner = new Client();
owner.userId = ownerId;
owner.password = "OwnerCase" + randomBytes(24).toString("base64url");
function remember(id) {
  if (!report.resources.users.includes(id)) report.resources.users.push(id);
  save();
}
async function createAccount(actor, role, school, extra = {}) {
  const account = await actor.call("accounts", {
    role,
    identityKey: `${tag}:${role}:${extra.roll ?? school.code}`,
    name: `${prefix} ${role} ${extra.roll ?? school.code}`,
    ...(role === "administrator" ? { schoolId: school.id } : {}),
    ...(role !== "student" ? { loginId: `${role}.${tag}` } : {}),
    ...extra,
  });
  ensure(
    account.state === "active" && account.issuedPassword,
    "New account credentials were not issued",
  );
  remember(account.id);
  const c = new Client();
  Object.assign(c, {
    userId: account.id,
    password: account.issuedPassword,
    loginId: account.loginId,
    schoolCode: school.code,
  });
  clients.push(c);
  return c;
}
function workbook(rows) {
  const files = unzipSync(rosterTemplate());
  let xml = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const records = rows
    .map(
      (r, i) =>
        `<row r="${i + 2}">` +
        r
          .map(
            (v, j) =>
              `<c r="${String.fromCharCode(65 + j)}${i + 2}" t="inlineStr"><is><t>${v}</t></is></c>`,
          )
          .join("") +
        "</row>",
    )
    .join("");
  xml = xml.replace("</sheetData>", records + "</sheetData>");
  files["xl/worksheets/sheet1.xml"] = strToU8(xml);
  return zipSync(files);
}
const quantile = (values) => {
  const a = [...values].sort((a, b) => a - b);
  return Math.round(a[Math.ceil(a.length * 0.95) - 1] * 100) / 100;
};
async function measure(label, items, action) {
  const times = [],
    failures = [];
  await Promise.all(
    items.map(async (item, i) => {
      const start = performance.now();
      try {
        await action(item, i);
      } catch {
        failures.push(i);
      } finally {
        times.push(performance.now() - start);
      }
    }),
  );
  const result = {
    requests: items.length,
    failures: failures.length,
    p95Ms: quantile(times),
    maxMs: Math.round(Math.max(...times)),
    targetMs: 2000,
  };
  report.load ??= {
    environment:
      "GitHub-hosted Ubuntu runner → Cloudflare Worker → Supabase ap-northeast-1, real Auth/RLS/Queues",
    concurrency: items.length,
    aiCompletionExcluded: true,
  };
  report.load[label] = result;
  save();
  ensure(!failures.length, `${label} had ${failures.length} failures`);
}

try {
  await step("verified live release and public signup disabled", async () => {
    const health = await new Client().request("/healthz");
    ensure(
      health.data.release === process.env.EXPECTED_RELEASE_SHA,
      "Unexpected deployed release",
    );
    report.deployedRelease = health.data.release;
    const settings = await fetch(target.supabaseUrl + "/auth/v1/settings", {
      headers: { apikey: target.supabasePublishableKey },
      signal: AbortSignal.timeout(20000),
    }).then((r) => r.json());
    report.publicSignupDisabled = settings.disable_signup === true;
    ensure(
      report.publicSignupDisabled,
      "Supabase public signup must be disabled",
    );
  });
  await step(
    "restricted synthetic owner bootstrap and fresh-session password change",
    async () => {
      remember(ownerId);
      const result = await bootstrapOwner(admin, {
        userId: ownerId,
        password: owner.password,
        displayName: `${prefix} owner`,
        aliasDomain: target.authAliasDomain,
      });
      ensure(
        result.state === "active",
        "Synthetic owner bootstrap was not new",
      );
      await owner.login(true);
      await owner.changePassword();
    },
  );
  const schools = [];
  await step(
    "owner provisions two schools, administrators and teachers",
    async () => {
      for (let n = 0; n < 2; n++) {
        const school = { code: `live-${tag}-${n}` };
        school.id = await owner.call("schools", {
          code: school.code,
          name: `${prefix} school ${n}`,
          timezone: "Asia/Kolkata",
          plan: "Synthetic acceptance",
          startsAt: new Date(Date.now() - 86400000).toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          teacherLimit: 5,
          studentLimit: 100,
          aiLimit: 0,
          storageLimit: 10485760,
        });
        schools.push(school);
        report.resources.schools.push(school.id);
        save();
        school.admin = await createAccount(owner, "administrator", school);
        await school.admin.login();
        await school.admin.changePassword();
        school.classId = await school.admin.call("classes", {
          academicYear: "2026",
          name: "9",
          section: "B",
        });
        school.teacher = await createAccount(school.admin, "teacher", school);
        await school.teacher.login();
        await school.teacher.changePassword();
        await school.admin.call("assignments", {
          teacherId: school.teacher.userId,
          classId: school.classId,
          subject: "Computing",
        });
      }
    },
  );
  const a = schools[0],
    b = schools[1];
  let students = [];
  await step("tenant isolation and unauthorized role escalation", async () => {
    await a.admin.call(
      "schools",
      {
        code: `deny-${tag}`,
        name: "Denied",
        timezone: "Asia/Kolkata",
        plan: "Denied",
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 100000).toISOString(),
        teacherLimit: 1,
        studentLimit: 1,
        aiLimit: 0,
      },
      403,
    );
    await a.teacher.call(
      "accounts",
      {
        role: "administrator",
        schoolId: b.id,
        identityKey: "denied",
        name: "Denied",
        loginId: "denied.account",
      },
      403,
    );
    await b.teacher.call(
      "assignments",
      { teacherId: a.teacher.userId, classId: a.classId, subject: "Computing" },
      403,
    );
    await a.teacher.login(false, a.teacher.password.toLowerCase(), 401);
    // Restore authenticated client after deliberately failed sign-in.
    await a.teacher.request("/v1/auth/session");
  });
  await step(
    "50 synthetic students provisioned through the assigned teacher",
    async () => {
      for (let start = 0; start < count; start += 5) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(5, count - start) }, (_, j) =>
            createAccount(a.teacher, "student", a, {
              classId: a.classId,
              className: "9",
              section: "B",
              roll: String(start + j + 1).padStart(2, "0"),
              admissionNumber: `${tag}-${start + j + 1}`,
            }),
          ),
        );
        students.push(...batch);
      }
      b.student = await createAccount(b.teacher, "student", b, {
        classId: b.classId,
        className: "9",
        section: "B",
        roll: "01",
        admissionNumber: `other-${tag}`,
      });
      await b.student.login();
      report.authSetup = {
        paced: true,
        minimumDelayMs: 2200,
        reason:
          "Provider token endpoint has a documented 30-request burst bucket; the 50-user answer/save benchmark starts only after sessions exist.",
      };
      for (const s of students) {
        await s.login();
        await delay(2200);
      }
      await students[0].login(false, students[0].password.toUpperCase());
      await students[0].call(
        "accounts",
        {
          role: "teacher",
          identityKey: "denied",
          name: "Denied",
          loginId: "denied.teacher",
        },
        403,
      );
    },
  );
  await step(
    "concurrent Excel previews/imports reuse identities without password redisplay",
    async () => {
      const bytes = workbook([
        [`${prefix} student 01`, "9", "B", "01", `${tag}-1`],
        [`${prefix} imported`, "9", "B", "99", `import-${tag}`],
      ]);
      const headers = {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Idempotency-Key": `synthetic-${tag}`,
      };
      const previews = await Promise.all([
        a.teacher.request(
          `/v1/imports/preview?classId=${a.classId}`,
          bytes,
          200,
          { headers },
        ),
        a.teacher.request(
          `/v1/imports/preview?classId=${a.classId}`,
          bytes,
          200,
          { headers },
        ),
      ]);
      ensure(
        previews[0].data.data.id === previews[1].data.data.id,
        "Duplicate preview created two jobs",
      );
      const jobId = previews[0].data.data.id;
      ensure(
        previews[0].data.data.rows.find((r) => r.row === 2).state ===
          "existing",
        "Existing student not discovered",
      );
      const imports = await Promise.all([
        a.teacher.call("imports/confirm", { jobId, rows: [2, 3] }),
        a.teacher.call("imports/confirm", { jobId, rows: [2, 3] }),
      ]);
      for (const r of imports)
        for (const row of r.outcomes) if (row.id) remember(row.id);
      const retried = await a.teacher.call("imports/confirm", {
        jobId,
        rows: [2, 3],
      });
      ensure(
        retried.failed === 0 && retried.created === 0,
        "Import retry did not converge",
      );
      ensure(
        !retried.outcomes.some((r) => r.issuedPassword),
        "Import retry redisplayed credentials",
      );
      const registry = await admin(
        `/rest/v1/student_registry?school_id=eq.${a.id}&admission_number=eq.import-${tag}&select=student_id`,
      );
      ensure(registry.length === 1, "Concurrent import duplicated identity");
      remember(registry[0].student_id);
    },
  );
  const paper = JSON.parse(readFileSync("tests/synthetic-paper.json", "utf8"));
  let version, attempts;
  await step(
    "immutable mixed-format 30-minute 25-mark paper and recipient snapshots",
    async () => {
      Object.assign(paper, {
        opensAt: new Date(Date.now() - 60000).toISOString(),
        closesAt: new Date(Date.now() + 3600000).toISOString(),
        recipients: students.map((s, i) => ({
          studentId: s.userId,
          extraSeconds: i === 0 ? 120 : 0,
          closesAt: null,
        })),
      });
      version = await a.teacher.call("exams/publish", {
        ...paper,
        classId: a.classId,
      });
      // An earlier synthetic sitting supplies real queued subjective work while
      // the measured sitting runs; no mocked provider output is introduced.
      const warmup = await a.teacher.call("exams/publish", {
        ...paper,
        title: `${paper.title} background warmup`,
        classId: a.classId,
      });
      const warmupAttempts = await Promise.all(
        students.map(async (s) => {
          const writer = randomUUID();
          const attempt = await s.call("attempts/start", {
            versionId: warmup,
            writer,
          });
          await s.call("attempts/submit", { attemptId: attempt.id, writer });
          return attempt.id;
        }),
      );
      report.backgroundWarmup = {
        versionId: warmup,
        attempts: warmupAttempts.length,
        expectedJobs: count * 2,
      };
      ensure(
        paper.durationSeconds === 1800 &&
          paper.questions.reduce((n, q) => n + q.max, 0) === 2500,
        "Wrong PRD paper fixture",
      );
      const qs = await students[0].call(`questions?version_id=${version}`);
      ensure(
        qs.length === paper.questions.length &&
          qs.every((q) => !("key" in q) && !("rubric" in q.content)),
        "Student question data exposed protected keys",
      );
      ensure(
        (await b.student.call(`questions?version_id=${version}`)).length === 0,
        "Foreign student read exam",
      );
      await b.student.call(
        "attempts/start",
        { versionId: version, writer: randomUUID() },
        403,
      );
      attempts = await Promise.all(
        students.map(async (s) => {
          s.writer = randomUUID();
          return s.call("attempts/start", {
            versionId: version,
            writer: s.writer,
          });
        }),
      );
      const resumed = await students[0].call("attempts/start", {
        versionId: version,
        writer: students[0].writer,
      });
      ensure(
        resumed.id === attempts[0].id &&
          JSON.stringify(resumed.display_order) ===
            JSON.stringify(attempts[0].display_order),
        "Resume changed attempt/shuffle",
      );
      ensure(
        Math.abs(
          (Date.parse(attempts[0].deadline) -
            Date.parse(attempts[0].started_at)) /
            1000 -
            1920,
        ) < 2,
        "Accommodation was not applied by server",
      );
    },
  );
  const first = paper.questions[0],
    firstKey = paper.keys.find((k) => k.questionId === first.id);
  await step(
    "50-concurrent-student answer saves with real database connections",
    async () => {
      let backgroundObserved = false,
        backgroundState = [];
      for (let i = 0; i < 600; i++) {
        backgroundState = await admin(
          `/rest/v1/outbox?school_id=eq.${a.id}&kind=eq.subjective&select=status&limit=200`,
        );
        if (backgroundState.some((j) => j.status === "processing")) {
          backgroundObserved = true;
          break;
        }
        if (
          backgroundState.length &&
          backgroundState.every((j) =>
            ["done", "unavailable", "failed"].includes(j.status),
          )
        )
          break;
        await delay(200);
      }
      report.backgroundWarmup.processingObservedBeforeMeasuredSaves =
        backgroundObserved;
      report.backgroundWarmup.statesBeforeMeasuredSaves = Object.fromEntries(
        [
          "pending",
          "dispatched",
          "processing",
          "done",
          "unavailable",
          "failed",
        ].map((s) => [s, backgroundState.filter((j) => j.status === s).length]),
      );
      await measure("answerSave", students, (s, i) =>
        s.call("attempts/answers", {
          attemptId: attempts[i].id,
          questionId: first.id,
          writer: s.writer,
          revision: 1,
          response: firstKey.correct,
        }),
      );
      await students[0].call("attempts/answers", {
        attemptId: attempts[0].id,
        questionId: first.id,
        writer: students[0].writer,
        revision: 1,
        response: firstKey.correct,
      });
      await students[0].call(
        "attempts/answers",
        {
          attemptId: attempts[0].id,
          questionId: first.id,
          writer: students[0].writer,
          revision: 1,
          response: first.options[1].id,
        },
        409,
      );
      await students[0].call(
        "attempts/answers",
        {
          attemptId: attempts[0].id,
          questionId: first.id,
          writer: randomUUID(),
          revision: 2,
          response: firstKey.correct,
        },
        409,
      );
      for (const q of paper.questions.slice(1)) {
        const k = paper.keys.find((k) => k.questionId === q.id);
        const response =
          q.type === "subjective"
            ? "Synthetic typed answer"
            : q.type === "blank"
              ? Object.fromEntries(k.units.map((u) => [u.id, " CPU "]))
              : q.type === "match"
                ? Object.fromEntries(k.units.map((u) => [u.id, u.right]))
                : k.correct;
        await students[0].call("attempts/answers", {
          attemptId: attempts[0].id,
          questionId: q.id,
          writer: students[0].writer,
          revision: 1,
          response,
        });
      }
      await students[0].call("reports/student", {}, 403);
    },
  );
  await step(
    "50 concurrent submissions, duplicate receipts and finalized-write denial",
    async () => {
      let receipts = [];
      await measure("submission", students, async (s, i) => {
        receipts[i] = await s.call("attempts/submit", {
          attemptId: attempts[i].id,
          writer: s.writer,
        });
      });
      const duplicate = await students[0].call("attempts/submit", {
        attemptId: attempts[0].id,
        writer: students[0].writer,
      });
      ensure(
        duplicate.receipt === receipts[0].receipt,
        "Duplicate submit changed receipt",
      );
      await students[0].call(
        "attempts/answers",
        {
          attemptId: attempts[0].id,
          questionId: first.id,
          writer: students[0].writer,
          revision: 2,
          response: firstKey.correct,
        },
        409,
      );
      report.load.background = {
        subjectiveJobsExpected: count * 2,
        providerConfigured: false,
      };
    },
  );
  await step(
    "server objective scoring, teacher review and published-only progress",
    async () => {
      ensure(
        (await students[0].call("results")).length === 0,
        "Unpublished marks leaked",
      );
      await b.teacher.call(
        "grades/details",
        { attemptId: attempts[0].id },
        403,
      );
      await owner.call("grades/details", { attemptId: attempts[0].id }, 403);
      for (const q of paper.questions.filter((q) => q.type === "subjective"))
        await a.teacher.call("grades/review", {
          attemptId: attempts[0].id,
          questionId: q.id,
          score: q.max,
          revision: 1,
          feedback: "Synthetic teacher review",
          reason: "Synthetic acceptance",
        });
      await a.teacher.call("results/publish", {
        attemptId: attempts[0].id,
        reason: "Synthetic publication",
      });
      const result = (await students[0].call("results"))[0];
      ensure(
        Number(result.total) === 2500 && Number(result.maximum) === 2500,
        "Server grade total was incorrect",
      );
      const progress = await students[0].call("reports/student", {});
      ensure(
        Number(progress.count) === 1 && Number(progress.percentage) === 100,
        "Published metrics were incorrect",
      );
      ensure(
        (await b.student.call("results")).length === 0,
        "Cross-school results leaked",
      );
    },
  );
  await step("teacher-only group posts and membership revocation", async () => {
    const groupId = await a.teacher.call("groups", {
      classId: a.classId,
      subject: "Computing",
      title: `${prefix} group`,
    });
    await students[0].call("groups/members", {
      groupId,
      studentId: students[0].userId,
      state: "pending",
    });
    await a.teacher.call("groups/members", {
      groupId,
      studentId: students[0].userId,
      state: "active",
    });
    const postId = await a.teacher.call("groups/posts", {
      groupId,
      title: "Synthetic material",
      body: "Synthetic teacher-only content",
    });
    ensure(
      (await students[0].call(`posts?group_id=${groupId}`)).length === 1,
      "Approved member cannot read post",
    );
    await students[0].call(
      "groups/posts",
      { groupId, title: "Denied", body: "Denied" },
      403,
    );
    const pdf = new TextEncoder().encode(
      "%PDF-1.4\nSynthetic private upload\n%%EOF\n",
    );
    const upload = (
      await a.teacher.request(`/v1/files/upload?postId=${postId}`, pdf, 200, {
        headers: {
          "Content-Type": "application/pdf",
          "X-Filename": "synthetic.pdf",
        },
      })
    ).data.data;
    ensure(upload.state === "quarantined", "Unscanned upload marked clean");
    report.resources.attachmentId = upload.id;
    await students[0].request(`/v1/files/${upload.id}`, undefined, 403);
    await b.student.request(`/v1/files/${upload.id}`, undefined, 403);
    await a.teacher.call("groups/members", {
      groupId,
      studentId: students[0].userId,
      state: "removed",
    });
    ensure(
      (await students[0].call(`posts?group_id=${groupId}`)).length === 0,
      "Revoked member still reads post",
    );
  });
  await step(
    "private query deadlines, extensions, replies and reopen cycles",
    async () => {
      await a.teacher.call("queries/policy", {
        classId: a.classId,
        subject: "Computing",
        hours: 24,
      });
      const queryId = await students[0].call("queries", {
        teacherId: a.teacher.userId,
        classId: a.classId,
        subject: "Computing",
        topic: "Synthetic query",
        body: "Synthetic private question",
      });
      const cycle = (
        await students[0].call(`query-cycles?query_id=${queryId}`)
      )[0];
      ensure(
        Date.parse(cycle.original_due_at) - Date.parse(cycle.started_at) ===
          86400000,
        "24-hour deadline is not exact",
      );
      const dueAt = new Date(Date.parse(cycle.due_at) + 3600000).toISOString();
      await a.teacher.call("queries/deadline", {
        queryId,
        dueAt,
        revision: 1,
        reason: "Synthetic extension",
      });
      const revised = (
        await students[0].call(`query-cycles?query_id=${queryId}`)
      )[0];
      ensure(
        revised.original_due_at === cycle.original_due_at &&
          Date.parse(revised.due_at) === Date.parse(dueAt),
        "Extension changed original deadline",
      );
      ensure(
        (await a.admin.call(`query-messages?query_id=${queryId}`)).length ===
          0 &&
          (await b.teacher.call(`query-messages?query_id=${queryId}`))
            .length === 0,
        "Private query content leaked",
      );
      await a.teacher.call("queries/replies", {
        queryId,
        kind: "solution",
        body: "Synthetic solution",
      });
      await students[0].call("queries/state", { queryId, state: "resolved" });
      await a.teacher.call("queries/policy", {
        classId: a.classId,
        subject: "Computing",
        hours: 168,
      });
      await students[0].call("queries/replies", {
        queryId,
        kind: "clarification",
        body: "Synthetic follow-up",
      });
      const reopened = (
        await students[0].call(`query-cycles?query_id=${queryId}`)
      ).find((c) => c.cycle === 2);
      ensure(
        Date.parse(reopened.original_due_at) -
          Date.parse(reopened.started_at) ===
          604800000,
        "168-hour reopen deadline is not exact",
      );
    },
  );
  await step(
    "login-ID changes and attributed staff reset invalidate old sessions",
    async () => {
      const s = students[0],
        oldId = s.loginId;
      await s.call("auth/reauthenticate", { password: s.password });
      s.loginId = `changed.${tag}`;
      await s.call("accounts/login-id", { loginId: s.loginId });
      const old = new Client();
      Object.assign(old, {
        schoolCode: a.code,
        loginId: oldId,
        password: s.password,
      });
      await old.login(false, old.password, 401);
      await s.login();
      const prior = s.cookie;
      await ordinaryToken(s);
      ensure(
        (await ordinaryDataApi(s, `memberships?id=eq.${s.userId}&select=id`))
          .data.length === 1,
        "Ordinary JWT cannot read own membership",
      );
      await ordinaryToken(b.student);
      ensure(
        (
          await ordinaryDataApi(
            b.student,
            `memberships?id=eq.${s.userId}&select=id`,
          )
        ).data.length === 0,
        "Ordinary JWT crossed school boundary",
      );
      const reset = await a.teacher.call("auth/password", {
        userId: s.userId,
        currentPassword: a.teacher.password,
        reason: "Synthetic authorized reset",
      });
      ensure(
        reset.issuedPassword && reset.sessionsRevoked,
        "Reset did not issue a new credential",
      );
      const stale = new Client();
      stale.cookie = prior;
      await stale.request("/v1/auth/session", undefined, 401);
      await ordinaryDataApi(
        s,
        `memberships?id=eq.${s.userId}&select=id`,
        undefined,
        [401, 403],
      );
      await s.login(false, s.password, 401);
      s.password = reset.issuedPassword;
      await s.login(false, s.password.toUpperCase());
      await ordinaryToken(s);
      ensure(
        (await ordinaryDataApi(s, `memberships?id=eq.${s.userId}&select=id`))
          .data.length === 1,
        "Fresh ordinary JWT denied after reset",
      );
      const events = [];
      for (let offset = 0; offset < 10000; offset += 100) {
        const page = await a.admin.call(`audit?limit=100&offset=${offset}`);
        events.push(...page);
        if (page.length < 100) break;
      }
      ensure(
        events.some(
          (e) =>
            e.actor_id === a.teacher.userId &&
            e.action === "account.credentials.revoked",
        ),
        "Reset audit lost actual staff attribution",
      );
    },
  );
  await step(
    "private R2 report export through actual scheduled Queue processing",
    async () => {
      const id = await a.teacher.call("reports/exports", {
        studentId: students[0].userId,
      });
      report.resources.exportId = id;
      save();
      let ready = false;
      for (let i = 0; i < 48; i++) {
        const r = await a.teacher.request(
          `/v1/exports/${id}`,
          undefined,
          [200, 403, 409],
        );
        if (r.status === 200) {
          ensure(
            typeof r.data === "string" &&
              r.data.includes("Papperly published-result report"),
            "Unexpected export content",
          );
          ready = true;
          break;
        }
        await delay(5000);
      }
      ensure(ready, "Private export did not finish within four minutes");
      await b.teacher.request(`/v1/exports/${id}`, undefined, 403);
    },
  );
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : "Acceptance failure";
  process.exitCode = 1;
  console.error(report.error);
} finally {
  // Preserve append-only audit and synthetic exam evidence. Revoke sessions,
  // deactivate only this run's memberships, suspend its schools, remove Auth users.
  try {
    const found = await admin(
      "/rest/v1/memberships?" +
        new URLSearchParams({
          display_name: `like.${prefix}%`,
          select: "id,school_id,role",
        }),
    );
    if (Array.isArray(found)) for (const user of found) remember(user.id);
    // Stop reconciliation for these actors before removing provider identities.
    if (Array.isArray(found))
      for (const user of found)
        await admin(`/rest/v1/memberships?id=eq.${user.id}`, "PATCH", {
          active: false,
        });
    if (Array.isArray(found) && found.length) {
      const reservations = await admin(
        "/rest/v1/audit_events?" +
          new URLSearchParams({
            actor_id: `in.(${found.map((m) => m.id).join(",")})`,
            action: "eq.account.reserved",
            select: "subject_id",
            limit: "1000",
          }),
      );
      if (Array.isArray(reservations))
        for (const reservation of reservations)
          if (reservation.subject_id) remember(reservation.subject_id);
    }
    const directClient = clients.find((c) => c.dbJwt);
    let inactiveRlsDenied;
    if (directClient) {
      try {
        const check = await ordinaryDataApi(
          directClient,
          "rpc/owner_usage",
          { p: {} },
          [200, 401, 403],
        );
        inactiveRlsDenied = check.status !== 200;
      } catch {
        inactiveRlsDenied = false;
      }
      if (!inactiveRlsDenied) {
        report.passed = false;
        process.exitCode = 1;
        report.error = "Inactive ordinary JWT retained RPC access";
      }
    }
    for (const id of [...report.resources.users].reverse()) {
      const member = Array.isArray(found)
        ? found.find((m) => m.id === id)
        : null;
      if (member) {
        await admin("/rest/v1/rpc/runtime_credentials_revoke", "POST", {
          p: {
            userId: id,
            actorId: ownerId,
            reason: "Synthetic acceptance teardown",
          },
        });
      }
      await admin(`/auth/v1/admin/users/${id}`, "DELETE", undefined, true);
    }
    for (const id of report.resources.users)
      ensure(
        (await admin(`/auth/v1/admin/users/${id}`, "GET", undefined, true)) ===
          null,
        "Synthetic Auth cleanup did not complete",
      );
    for (const id of report.resources.schools)
      await admin(`/rest/v1/schools?id=eq.${id}`, "PATCH", {
        status: "suspended",
      });
    report.cleanup = {
      authUsersRemoved: true,
      membershipsDeactivated: true,
      schoolsSuspended: true,
      syntheticAuditAndExamEvidenceRetained: true,
      inactiveOrdinaryJwtDenied: inactiveRlsDenied,
    };
  } catch {
    report.cleanup = { failed: true, requiresExactIdReconciliation: true };
    report.passed = false;
    process.exitCode = 1;
  }
  report.completedAt = new Date().toISOString();
  report.limitations =
    "Synthetic staging workflow only. Provider AI/scanning unavailable, uploads stay quarantined. Audit and synthetic exam rows retained with inactive identities. Native load target is measured, not assumed passed; PDF/restore/retention and exhaustive FR matrix remain separate.";
  if (report.load)
    report.load.targetPassed =
      report.backgroundWarmup?.processingObservedBeforeMeasuredSaves === true &&
      report.load.answerSave?.p95Ms < 2000 &&
      report.load.submission?.p95Ms < 2000 &&
      report.load.answerSave?.failures === 0 &&
      report.load.submission?.failures === 0;
  save();
  console.log(
    JSON.stringify({
      passed: report.passed,
      checks: report.checks.length,
      load: report.load,
      cleanup: report.cleanup,
    }),
  );
}

import process from "node:process";
import console from "node:console";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { geminiJson, GEMINI_MODEL } from "../apps/api/src/gemini";
import { ApiError, type Env } from "../apps/api/src/platform";
import { fixturePaper } from "../tests/fixtures";
import { validateFormattedPaper } from "../packages/domain/src/formatting";
import { validateSuggestion } from "../packages/domain/src/index";
import {
  guidance,
  type Question,
  type Key,
} from "../packages/contracts/src/index";
if (
  process.env.GITHUB_REPOSITORY !== "MrUjjawalMishra/papperly" ||
  process.env.GITHUB_REF !== "refs/heads/ops/staging-ai-checks"
)
  throw Error("Restricted synthetic AI verification branch required");
const env = {
  AI_PROVIDER: "gemini-free",
  AI_MODEL: GEMINI_MODEL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_FREE_TIER_CONFIRMED: process.env.GEMINI_FREE_TIER_CONFIRMED,
} as Env;
const report = {
  provider: "Google Gemini free tier",
  model: GEMINI_MODEL,
  apiRevision: "2026-05-20",
  sourceCommit: process.env.GITHUB_SHA,
  syntheticOnly: true,
  maximumRequests: 3,
  requests: 0,
  checks: [] as object[],
  passed: false,
};
async function invoke(task: string, evidence: unknown) {
  report.requests++;
  return geminiJson(env, task, evidence);
}
try {
  const base = fixturePaper(),
    questions: Question[] = [],
    keys: Key[] = [];
  for (let i = 0; i < 30; i++) {
    const q = base.questions[i % base.questions.length],
      k = base.keys.find((k) => k.questionId === q.id)!;
    const remap = new Map<string, string>();
    const pair = JSON.parse(
      JSON.stringify({ q, k }).replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
        (id) => {
          if (!remap.has(id)) remap.set(id, randomUUID());
          return remap.get(id)!;
        },
      ),
    );
    pair.q.prompt = `Synthetic computing example ${i + 1}: ${q.type === "mcq" ? "Select the correct label." : q.type === "boolean" ? "A CPU processes instructions." : q.type === "blank" ? "Complete the statement: the ____ processes instructions." : q.type === "match" ? "Match each input label to its output label." : "Explain the role of a processor."}`;
    questions.push(pair.q);
    keys.push(pair.k);
  }
  const rawText = questions
    .map((q, i) =>
      [
        `Question ${i + 1}; stable ID ${q.id}; type ${q.type}; maximum ${q.max} hundredths; section ${q.section}; primary topic ${q.primaryTopic}`,
        `Prompt: ${q.prompt}`,
        q.type === "mcq"
          ? `Shuffle options: ${q.shuffleOptions}; Options:\n${q.options.map((o) => `${o.id} | ${o.text}`).join("\n")}`
          : q.type === "match"
            ? `Left:\n${q.left.map((o) => `${o.id} | ${o.text}`).join("\n")}\nRight:\n${q.right.map((o) => `${o.id} | ${o.text}`).join("\n")}`
            : q.type === "blank"
              ? `Blank IDs: ${q.blanks.join(", ")}`
              : "",
        `Supplied teacher key/rubric: ${JSON.stringify(keys[i])}`,
      ].join("\n"),
    )
    .join("\n\n");
  let start = performance.now();
  const formatted = validateFormattedPaper(
    rawText,
    await invoke("format", { rawText, revision: 1 }),
  );
  if (formatted.questions.length !== 30) throw Error("Question count changed");
  for (const q of questions) {
    const actual = formatted.questions.find((a) => a.id === q.id);
    if (!actual || JSON.stringify(actual) !== JSON.stringify(q)) {
      // Compare parsed object values without depending on provider JSON property order.
      if (
        !actual ||
        actual.prompt !== q.prompt ||
        actual.type !== q.type ||
        actual.max !== q.max ||
        JSON.stringify(Object.entries(actual).sort()) !==
          JSON.stringify(Object.entries(q).sort())
      )
        throw Error("Question fields changed");
    }
  }
  report.checks.push({
    name: "30 mixed-format typed-question preservation and key validation",
    passed: true,
    count: 30,
    requiresTeacherApproval: formatted.requiresTeacherApproval,
    durationMs: Math.round(performance.now() - start),
  });
  const q = questions.find((q) => q.type === "subjective")!,
    k = keys.find((k) => k.questionId === q.id)!;
  start = performance.now();
  validateSuggestion(
    q,
    k,
    await invoke("subjective", {
      question: q,
      key: k,
      response: "A processor executes instructions and controls operations.",
    }),
  );
  report.checks.push({
    name: "Subjective rubric bounds and stable criterion IDs",
    passed: true,
    durationMs: Math.round(performance.now() - start),
  });
  const id = randomUUID();
  start = performance.now();
  const insight = guidance.parse(
    await invoke("insight", {
      results: [
        {
          id,
          total: 100,
          maximum: 500,
          subject: "Computing",
          topics: [{ topic: "CPU", earned: 100, maximum: 500 }],
        },
      ],
      resources: [],
    }),
  );
  const cited = [
    ...insight.resultIds,
    ...insight.strengths.flatMap((s) => s.evidence),
    ...insight.practice.flatMap((p) => p.evidence),
  ];
  if (
    cited.some((c) => c !== id) ||
    insight.sufficiency === "trend" ||
    insight.practice.some((p) => p.resourceId !== null) ||
    /\d/.test(
      [
        ...insight.strengths.map((s) => s.text),
        ...insight.practice.map((p) => p.action),
      ].join(" "),
    )
  )
    throw Error("Insight invented evidence or trends");
  report.checks.push({
    name: "Published synthetic evidence-only guidance with insufficient trend evidence",
    passed: true,
    durationMs: Math.round(performance.now() - start),
  });
  report.passed = true;
} catch (error) {
  Object.assign(report, {
    errorCode: error instanceof ApiError ? error.code : "VALIDATION_FAILED",
  });
  process.exitCode = 1;
} finally {
  mkdirSync("work", { recursive: true });
  writeFileSync(
    "work/gemini-verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}

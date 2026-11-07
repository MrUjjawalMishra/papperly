import {
  paper,
  type Question,
  type Key,
  suggestion,
} from "../../contracts/src/index";
export function validatePaper(input: unknown) {
  const p = paper.parse(input);
  const start = Date.parse(p.opensAt),
    end = Date.parse(p.closesAt);
  if (
    end <= start ||
    p.durationSeconds * 1000 > end - start ||
    (p.lastStartAt &&
      (Date.parse(p.lastStartAt) < start || Date.parse(p.lastStartAt) > end))
  )
    throw Error("INVALID_SCHEDULE");
  if (
    new Set(p.questions.map((q) => q.id)).size !== p.questions.length ||
    new Set(p.recipients.map((r) => r.studentId)).size !==
      p.recipients.length ||
    p.keys.length !== p.questions.length
  )
    throw Error("DUPLICATE_ID");
  for (const q of p.questions) {
    const k = p.keys.filter((k) => k.questionId === q.id);
    if (k.length !== 1) throw Error("MISSING_KEY");
    validateKey(q, k[0]);
  }
  return p;
}
export function validateKey(q: Question, k: Key) {
  if (
    q.type === "mcq" &&
    (!q.options.some((o) => o.id === k.correct) ||
      new Set(q.options.map((o) => o.id)).size !== q.options.length)
  )
    throw Error("INVALID_KEY");
  if (q.type === "boolean" && typeof k.correct !== "boolean")
    throw Error("INVALID_KEY");
  if (
    q.type === "subjective" &&
    (!k.reference ||
      !k.rubric?.length ||
      k.rubric.reduce((s, c) => s + c.max, 0) !== q.max)
  )
    throw Error("INVALID_RUBRIC");
  if (q.type === "blank" || q.type === "match") {
    const ids = q.type === "blank" ? q.blanks : q.left.map((i) => i.id);
    if (
      new Set(ids).size !== ids.length ||
      !k.units ||
      k.units.length !== ids.length ||
      new Set(k.units.map((u) => u.id)).size !== ids.length ||
      k.units.some((u) => !ids.includes(u.id) || u.max <= 0) ||
      k.units.reduce((s, u) => s + u.max, 0) !== q.max
    )
      throw Error("INVALID_UNITS");
    if (
      q.type === "blank" &&
      k.units.some(
        (u) => !u.alternatives?.length || u.alternatives.some((a) => !a.trim()),
      )
    )
      throw Error("INVALID_BLANK");
    if (
      q.type === "match" &&
      (new Set(q.right.map((o) => o.id)).size !== q.right.length ||
        q.right.length !== ids.length ||
        new Set(k.units.map((u) => u.right)).size !== ids.length ||
        k.units.some((u) => !q.right.some((r) => r.id === u.right)))
    )
      throw Error("INVALID_MATCH");
  }
}
export function score(q: Question, k: Key, response: unknown): number | null {
  if (q.type === "subjective") return null;
  if (q.type === "mcq" || q.type === "boolean")
    return response === k.correct ? q.max : 0;
  const r =
    response && typeof response === "object"
      ? (response as Record<string, unknown>)
      : {};
  return (k.units ?? []).reduce((total, u) => {
    const correct =
      q.type === "match"
        ? r[u.id] === u.right
        : u.alternatives?.some(
            (a) =>
              typeof r[u.id] === "string" &&
              a.trim().toLowerCase() ===
                (r[u.id] as string).trim().toLowerCase(),
          );
    return total + (correct ? u.max : 0);
  }, 0);
}
export function validateSuggestion(q: Question, k: Key, input: unknown) {
  const s = suggestion.parse(input);
  if (
    s.score > q.max ||
    !k.rubric ||
    s.criteria.length !== k.rubric.length ||
    new Set(s.criteria.map((c) => c.id)).size !== s.criteria.length ||
    s.criteria.some(
      (c) => !k.rubric?.some((r) => r.id === c.id && c.score <= r.max),
    ) ||
    s.criteria.reduce((a, c) => a + c.score, 0) !== s.score
  )
    throw Error("INVALID_SUGGESTION");
  return s;
}
export function deadline(
  start: number,
  durationSeconds: number,
  closes: number,
) {
  return Math.min(start + durationSeconds * 1000, closes);
}
export function queryDeadline(start: number, hours: number) {
  if (!Number.isInteger(hours) || hours < 1 || hours > 336)
    throw Error("INVALID_HOURS");
  return start + hours * 3600000;
}
export function shuffle<T>(items: readonly T[], seed: string): T[] {
  let state = 2166136261;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const j = (state >>> 0) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function displayOrder(
  questions: Question[],
  seed: string,
  enabled: boolean,
) {
  const sections = [...new Set(questions.map((q) => q.section))];
  return sections.flatMap((section) => {
    const qs = questions.filter((q) => q.section === section);
    return (enabled ? shuffle(qs, seed + section) : qs).map((q) => ({
      id: q.id,
      options:
        q.type === "mcq"
          ? (enabled && q.shuffleOptions
              ? shuffle(q.options, seed + q.id)
              : q.options
            ).map((o) => o.id)
          : undefined,
    }));
  });
}
export interface Evidence {
  id: string;
  published: boolean;
  earned: number;
  maximum: number;
  correctUnits: number;
  answeredUnits: number;
  unansweredUnits: number;
  subject: string;
  topic: string | null;
  eligible: boolean;
}
export function metrics(rows: Evidence[]) {
  const r = rows.filter((r) => r.published && r.eligible);
  const sum = (
    k:
      | "earned"
      | "maximum"
      | "correctUnits"
      | "answeredUnits"
      | "unansweredUnits",
  ) => r.reduce((s, r) => s + r[k], 0);
  return {
    count: r.length,
    earned: sum("earned"),
    maximum: sum("maximum"),
    percentage: sum("maximum") ? (100 * sum("earned")) / sum("maximum") : null,
    objectiveAccuracy: sum("answeredUnits")
      ? sum("correctUnits") / sum("answeredUnits")
      : null,
    unanswered: sum("unansweredUnits"),
    trend: r.length >= 2 ? "available" : "more-evidence-needed",
    resultIds: r.map((r) => r.id),
  };
}
export const safeCsv = (v: unknown) =>
  '"' +
  String(v ?? "")
    .replace(/^[\s]*[=+\-@]/, "'$&")
    .replaceAll('"', '""') +
  '"';
export const normalizeLogin = (v: string) => {
  if (
    !/^[a-z0-9._-]{3,64}$/i.test(v) ||
    ["admin", "owner", "root", "support"].includes(v.toLowerCase())
  )
    throw Error("INVALID_LOGIN");
  return v.toLowerCase();
};

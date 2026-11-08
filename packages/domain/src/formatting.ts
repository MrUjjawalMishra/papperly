import type { z } from "zod";
import { formattedPaper } from "../../contracts/src/ai";
import { validateKey } from "./index";
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
export function validateFormattedPaper(rawText: string, input: unknown) {
  const parsed = formattedPaper.parse(input),
    source = normalize(rawText);
  if (
    !source ||
    new Set(parsed.questions.map((q) => q.id)).size !==
      parsed.questions.length ||
    new Set(parsed.keys.map((k) => k.questionId)).size !== parsed.keys.length
  )
    throw Error("AI_INVALID_QUESTION_IDS");
  const warnings = [...parsed.warnings];
  for (const q of parsed.questions) {
    const visible = [
      q.prompt,
      ...(q.type === "mcq"
        ? q.options.map((o) => o.text)
        : q.type === "match"
          ? [...q.left, ...q.right].map((o) => o.text)
          : []),
    ];
    if (visible.some((text) => !source.includes(normalize(text))))
      throw Error("AI_WORDING_CHANGED");
    const key = parsed.keys.find((k) => k.questionId === q.id);
    if (key) validateKey(q, key);
    else warnings.push("Missing approved key for " + q.id);
  }
  if (
    parsed.keys.some(
      (k) => !parsed.questions.some((q) => q.id === k.questionId),
    )
  )
    throw Error("AI_ORPHAN_KEY");
  return { ...parsed, warnings, requiresTeacherApproval: true as const };
}
export type FormattedPaper = z.infer<typeof formattedPaper>;

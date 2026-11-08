import { expect, it } from "vitest";
import { validateFormattedPaper } from "../packages/domain/src/formatting";
import { fixturePaper } from "./fixtures";
it("preserves supplied wording while leaving missing-key review explicit", () => {
  const { questions, keys } = fixturePaper();
  const raw = questions
    .map((q) =>
      [
        q.prompt,
        ...(q.type === "mcq"
          ? q.options.map((o) => o.text)
          : q.type === "match"
            ? [...q.left, ...q.right].map((o) => o.text)
            : []),
      ].join("\n"),
    )
    .join("\n");
  const result = validateFormattedPaper(raw, {
    questions,
    keys: keys.slice(1),
    warnings: [],
  });
  expect(result.requiresTeacherApproval).toBe(true);
  expect(result.warnings).toContain(
    "Missing approved key for " + questions[0].id,
  );
  expect(() =>
    validateFormattedPaper(raw, {
      questions: [{ ...questions[0], prompt: "Invented rewritten question" }],
      keys: [keys[0]],
      warnings: [],
    }),
  ).toThrow("AI_WORDING_CHANGED");
  expect(() =>
    validateFormattedPaper(raw, {
      questions: [questions[0], questions[0]],
      keys: [],
      warnings: [],
    }),
  ).toThrow("AI_INVALID_QUESTION_IDS");
});

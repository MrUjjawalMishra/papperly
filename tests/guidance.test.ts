import { expect, it } from "vitest";
import { validateGuidance } from "../packages/domain/src/guidance";
import { uid } from "./fixtures";
const evidence = {
  results: [
    {
      id: uid(1),
      classId: uid(10),
      subject: "Computing",
      scores: [
        { topic: "Loops", maximum: 100 },
        { topic: "Loops", maximum: 100 },
      ],
    },
    {
      id: uid(2),
      classId: uid(10),
      subject: "Computing",
      scores: [{ topic: "Loops", maximum: 100 }],
    },
    {
      id: uid(3),
      classId: uid(11),
      subject: "Mathematics",
      scores: [{ topic: "Algebra", maximum: 100 }],
    },
  ],
};
const basic = () => ({
  resultIds: [uid(1)],
  strengths: [{ text: "Review your released work", evidence: [uid(1)] }],
  practice: [
    {
      topic: "Loops",
      action: "Practise loop conditions",
      evidence: [uid(1)],
      resourceId: null,
    },
  ],
  sufficiency: "result-specific",
});
it("requires nonempty authorized evidence and an actual released topic for every claim", () => {
  expect(validateGuidance(evidence, basic()).sufficiency).toBe(
    "result-specific",
  );
  const missing = basic();
  missing.strengths[0].evidence = [];
  expect(() => validateGuidance(evidence, missing)).toThrow(
    "AI_UNAUTHORIZED_EVIDENCE",
  );
  const topic = basic();
  topic.practice[0].topic = "Invented";
  expect(() => validateGuidance(evidence, topic)).toThrow(
    "AI_UNAUTHORIZED_TOPIC",
  );
});
it("does not treat different subjects/classes or a single result as a trend", () => {
  expect(() =>
    validateGuidance(evidence, { ...basic(), sufficiency: "trend" }),
  ).toThrow("AI_INSUFFICIENT_EVIDENCE");
  expect(() =>
    validateGuidance(evidence, {
      ...basic(),
      resultIds: [uid(1), uid(3)],
      sufficiency: "trend",
    }),
  ).toThrow("AI_INSUFFICIENT_EVIDENCE");
  expect(
    validateGuidance(evidence, {
      ...basic(),
      resultIds: [uid(1), uid(2)],
      sufficiency: "trend",
    }).sufficiency,
  ).toBe("trend");
});
it("requires three scored topic units across comparable assessments for recurring practice", () => {
  const advice = basic();
  advice.practice[0].action = "Review recurring loop errors";
  expect(() => validateGuidance(evidence, advice)).toThrow(
    "AI_INSUFFICIENT_TOPIC_EVIDENCE",
  );
  advice.resultIds.push(uid(2));
  advice.practice[0].evidence.push(uid(2));
  expect(validateGuidance(evidence, advice).practice).toHaveLength(1);
});
it("rejects unvalidated numerical prose, unsafe labels and fabricated resource links", () => {
  for (const text of [
    "You missed two questions",
    "You scored 90%",
    "You are lazy",
    "Read https://example.invalid",
  ]) {
    const advice = basic();
    advice.strengths[0].text = text;
    expect(() => validateGuidance(evidence, advice)).toThrow();
  }
  expect(() =>
    validateGuidance(evidence, {
      ...basic(),
      practice: [{ ...basic().practice[0], resourceId: uid(9) }],
    }),
  ).toThrow("AI_UNAUTHORIZED_RESOURCE");
});

it("accepts an approved current resource reference without accepting arbitrary links", () => {
  const advice = {
    ...basic(),
    practice: [{ ...basic().practice[0], resourceId: uid(9) }],
  };
  expect(
    validateGuidance({ ...evidence, resources: [{ id: uid(9) }] }, advice)
      .practice[0].resourceId,
  ).toBe(uid(9));
});

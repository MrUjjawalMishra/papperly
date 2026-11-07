import { describe, it, expect } from "vitest";
import {
  score,
  queryDeadline,
  deadline,
  shuffle,
  metrics,
  validateSuggestion,
  validatePaper,
  safeCsv,
} from "../packages/domain/src/index";
import { fixturePaper } from "./fixtures";
describe("domain", () => {
  it("validates 30-minute 25-mark fourteen-record mixed-format fixture", () => {
    const p = validatePaper(fixturePaper());
    expect(p.questions).toHaveLength(14);
    expect(p.questions.reduce((s, q) => s + q.max, 0)).toBe(2500);
    for (const q of p.questions) {
      const k = p.keys.find((k) => k.questionId === q.id)!;
      const answer =
        q.type === "blank"
          ? Object.fromEntries(
              k.units!.map((u) => [
                u.id,
                "  " + u.alternatives![0].toUpperCase() + "  ",
              ]),
            )
          : q.type === "match"
            ? Object.fromEntries(k.units!.map((u) => [u.id, u.right]))
            : k.correct;
      expect(score(q, k, answer)).toBe(q.type === "subjective" ? null : q.max);
      expect(score(q, k, null)).toBe(q.type === "subjective" ? null : 0);
    }
  });
  it("calculates exact elapsed-hour targets and capped deadlines", () => {
    const t = Date.parse("2026-11-07T04:30:00Z");
    expect(new Date(queryDeadline(t, 24)).toISOString()).toBe(
      "2026-11-08T04:30:00.000Z",
    );
    expect(new Date(queryDeadline(t, 168)).toISOString()).toBe(
      "2026-11-14T04:30:00.000Z",
    );
    expect(() => queryDeadline(t, 337)).toThrow();
    expect(deadline(t, 1800, t + 1000)).toBe(t + 1000);
  });
  it("shuffle is stable and retains stable IDs", () => {
    const a = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(a, "seed")).toEqual(shuffle(a, "seed"));
    expect(shuffle(a, "seed").sort((a, b) => a - b)).toEqual(a);
  });
  it("metrics use weighted published eligible evidence only", () => {
    const row = {
      id: "a",
      published: true,
      eligible: true,
      earned: 10,
      maximum: 20,
      correctUnits: 1,
      answeredUnits: 2,
      unansweredUnits: 1,
      subject: "X",
      topic: null,
    };
    const m = metrics([
      row,
      { ...row, id: "b", earned: 90, maximum: 100 },
      { ...row, id: "secret", published: false },
    ]);
    expect(m.percentage).toBeCloseTo(10000 / 120);
    expect(m.resultIds).toEqual(["a", "b"]);
    expect(metrics([]).percentage).toBeNull();
  });
  it("rejects malformed keys, schedules and out-of-bounds AI grades", () => {
    const p = fixturePaper();
    expect(() => validatePaper({ ...p, closesAt: p.opensAt })).toThrow();
    const q = p.questions.find((q) => q.type === "subjective")!,
      k = p.keys.find((k) => k.questionId === q.id)!;
    expect(() =>
      validateSuggestion(q, k, {
        score: 501,
        criteria: [],
        model: "m",
        promptVersion: "1",
      }),
    ).toThrow();
  });
  it("neutralizes formula cells in CSV", () => {
    expect(safeCsv('=WEBSERVICE("x")')).toBe('"\'=WEBSERVICE(""x"")"');
  });
});

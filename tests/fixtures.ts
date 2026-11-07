import { type z } from "zod";
import {
  paper,
  type Question,
  type Key,
} from "../packages/contracts/src/index";
import { ids } from "./database";
export const uid = (n: number) =>
  `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function fixturePaper(): z.infer<typeof paper> {
  const questions: Question[] = [],
    keys: Key[] = [];
  let n = 1;
  const base = (max: number) => ({
    id: uid(n++),
    prompt: "Synthetic computing question",
    section: "A",
    max,
    primaryTopic: "Computing",
  });
  for (let i = 0; i < 5; i++) {
    const q = {
      ...base(100),
      type: "mcq" as const,
      options: [
        { id: uid(100 + i * 2), text: "Correct" },
        { id: uid(101 + i * 2), text: "Other" },
      ],
      shuffleOptions: true,
    };
    questions.push(q);
    keys.push({ questionId: q.id, correct: q.options[0].id });
  }
  for (let i = 0; i < 3; i++) {
    const q = { ...base(100), type: "boolean" as const };
    questions.push(q);
    keys.push({ questionId: q.id, correct: true });
  }
  const left = Array.from({ length: 4 }, (_, i) => ({
      id: uid(200 + i),
      text: `Input ${i}`,
    })),
    right = Array.from({ length: 4 }, (_, i) => ({
      id: uid(210 + i),
      text: `Output ${i}`,
    }));
  const match = { ...base(400), type: "match" as const, left, right };
  questions.push(match);
  keys.push({
    questionId: match.id,
    units: left.map((l, i) => ({ id: l.id, right: right[i].id, max: 100 })),
  });
  for (let i = 0; i < 3; i++) {
    const q = { ...base(100), type: "blank" as const, blanks: [uid(300 + i)] };
    questions.push(q);
    keys.push({
      questionId: q.id,
      units: [
        { id: q.blanks[0], max: 100, alternatives: ["CPU", "processor"] },
      ],
    });
  }
  for (let i = 0; i < 2; i++) {
    const q = { ...base(500), type: "subjective" as const };
    questions.push(q);
    keys.push({
      questionId: q.id,
      rubric: [
        { id: uid(400 + i), max: 500, description: "Explain accurately" },
      ],
      reference: "Teacher reference",
    });
  }
  return {
    title: "Class IX Computer Applications",
    subject: "Computing",
    instructions: "Synthetic test paper",
    rawText: "Synthetic fixture; no credentials",
    questions,
    keys,
    opensAt: new Date(Date.now() - 60000).toISOString(),
    closesAt: new Date(Date.now() + 3600000).toISOString(),
    durationSeconds: 1800,
    lastStartAt: null,
    shuffle: true,
    recipients: [
      { studentId: ids.student, extraSeconds: 0, closesAt: null },
      { studentId: ids.peer, extraSeconds: 0, closesAt: null },
    ],
  };
}

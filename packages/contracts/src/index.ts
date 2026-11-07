import { z } from "zod";
export const uuid = z.string().uuid();
export const marks = z.number().int().min(0).max(100000); // hundredths of a mark
const option = z
  .object({ id: uuid, text: z.string().min(1).max(4000) })
  .strict();
const base = {
  id: uuid,
  prompt: z.string().min(1).max(20000),
  section: z.string().max(100),
  max: marks.refine((n) => n > 0),
  primaryTopic: z.string().max(100).nullable(),
};
export const question = z.discriminatedUnion("type", [
  z
    .object({
      ...base,
      type: z.literal("mcq"),
      options: z.array(option).min(2).max(6),
      shuffleOptions: z.boolean(),
    })
    .strict(),
  z.object({ ...base, type: z.literal("boolean") }).strict(),
  z
    .object({
      ...base,
      type: z.literal("match"),
      left: z.array(option).min(1).max(30),
      right: z.array(option).min(1).max(30),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("blank"),
      blanks: z.array(uuid).min(1).max(30),
    })
    .strict(),
  z.object({ ...base, type: z.literal("subjective") }).strict(),
]);
export type Question = z.infer<typeof question>;
export const key = z
  .object({
    questionId: uuid,
    correct: z.unknown().optional(),
    units: z
      .array(
        z
          .object({
            id: uuid,
            max: marks,
            alternatives: z.array(z.string()).optional(),
            right: uuid.optional(),
          })
          .strict(),
      )
      .optional(),
    rubric: z
      .array(
        z
          .object({ id: uuid, max: marks, description: z.string().min(1) })
          .strict(),
      )
      .optional(),
    reference: z.string().max(20000).optional(),
  })
  .strict();
export type Key = z.infer<typeof key>;
export const paper = z
  .object({
    title: z.string().min(1).max(200),
    subject: z.string().min(1).max(100),
    instructions: z.string().min(1).max(10000),
    rawText: z.string().max(100000),
    questions: z.array(question).min(1).max(200),
    keys: z.array(key).min(1).max(200),
    opensAt: z.string().datetime(),
    closesAt: z.string().datetime(),
    durationSeconds: z.number().int().positive().max(43200),
    lastStartAt: z.string().datetime().nullable(),
    shuffle: z.boolean(),
    recipients: z
      .array(
        z
          .object({
            studentId: uuid,
            extraSeconds: z.number().int().min(0).max(43200),
            closesAt: z.string().datetime().nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(10000),
  })
  .strict();
export const login = z
  .object({
    schoolCode: z.string().min(1).max(64),
    loginId: z.string().min(3).max(64),
    password: z.string().min(1).max(256),
  })
  .strict();
export const answerSave = z
  .object({
    questionId: uuid,
    response: z.unknown(),
    revision: z.number().int().positive(),
    writer: uuid,
  })
  .strict();
export const suggestion = z
  .object({
    score: marks,
    criteria: z.array(
      z
        .object({ id: uuid, score: marks, reason: z.string().min(1).max(2000) })
        .strict(),
    ),
    model: z.string().min(1).max(100),
    promptVersion: z.string().min(1).max(100),
  })
  .strict();
export const guidance = z
  .object({
    resultIds: z.array(uuid),
    strengths: z
      .array(
        z
          .object({ text: z.string().max(1000), evidence: z.array(uuid) })
          .strict(),
      )
      .max(3),
    practice: z
      .array(
        z
          .object({
            topic: z.string().max(100),
            action: z.string().max(1000),
            evidence: z.array(uuid),
            resourceId: uuid.nullable(),
          })
          .strict(),
      )
      .max(3),
    sufficiency: z.enum(["result-specific", "trend", "more-evidence-needed"]),
  })
  .strict();
export const queryInput = z
  .object({
    teacherId: uuid,
    classId: uuid,
    subject: z.string().min(1).max(100),
    topic: z.string().min(1).max(200),
    body: z.string().min(1).max(20000),
  })
  .strict();
export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

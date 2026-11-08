import { z } from "zod";
const id = z.string().uuid();
export const userRole = z.enum([
  "owner",
  "administrator",
  "teacher",
  "student",
]);
export const sessionUser = z.object({ id, role: userRole }).strict();
export const authLoginResponse = z
  .object({ user: sessionUser, csrfToken: z.string().min(1) })
  .strict();
export const authSessionResponse = z
  .object({
    user: sessionUser,
    expiresAt: z.string().datetime({ offset: true }),
    csrfToken: z.string().min(1),
    mustChangePassword: z.boolean(),
  })
  .strict();
export const reauthenticationInput = z
  .object({ password: z.string().max(256) })
  .strict();
export const credentialChangeInput = z
  .object({
    userId: id,
    currentPassword: z.string().max(256),
    newPassword: z.string().max(256).optional(),
    reason: z.string().min(1).max(200),
  })
  .strict();
export const passwordChangeResponse = z
  .object({
    data: z.union([
      z
        .object({
          id,
          sessionsRevoked: z.literal(true),
          csrfToken: z.string().min(1),
        })
        .strict(),
      z
        .object({
          id,
          sessionsRevoked: z.literal(true),
          issuedPassword: z.string().min(1).max(256),
        })
        .strict(),
    ]),
  })
  .strict();
export const accountInput = z
  .object({
    schoolId: id.optional(),
    role: z.enum(["administrator", "teacher", "student"]),
    identityKey: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    loginId: z
      .string()
      .regex(/^[a-zA-Z0-9._-]{3,64}$/)
      .optional(),
    classId: id.optional(),
    className: z.string().max(50).optional(),
    section: z.string().max(50).optional(),
    roll: z.string().max(50).optional(),
    admissionNumber: z.string().max(100).optional(),
  })
  .strict();
const credentialFields = {
  loginId: z.string().optional(),
  issuedPassword: z.string().max(256).optional(),
  passwordPolicy: z
    .enum(["ASCII case-insensitive", "case-sensitive"])
    .optional(),
  credentialRecovery: z.string().max(2000).optional(),
};
export const accountProvisionResult = z
  .object({ id, state: z.enum(["active", "existing"]), ...credentialFields })
  .strict()
  .superRefine((v, ctx) => {
    if (v.state === "existing" && v.issuedPassword)
      ctx.addIssue({
        code: "custom",
        message: "Existing credentials must not be redisplayed",
      });
  });
export const accountProvisionResponse = z
  .object({ data: accountProvisionResult })
  .strict();
export const importConfirmationInput = z
  .object({
    jobId: id,
    rows: z.array(z.number().int().min(2).max(301)).max(300),
  })
  .strict();
export const importConfirmationResponse = z
  .object({
    data: z
      .object({
        outcomes: z
          .array(
            z
              .object({
                row: z.number().int().min(2).max(301),
                id: id.optional(),
                state: z.enum(["active", "existing", "failed"]),
                error: z.string().optional(),
                ...credentialFields,
              })
              .strict()
              .superRefine((v, ctx) => {
                if (v.state !== "failed" && !v.id)
                  ctx.addIssue({
                    code: "custom",
                    message: "Active/reused rows require immutable identity",
                  });
                if (v.state !== "active" && v.issuedPassword)
                  ctx.addIssue({
                    code: "custom",
                    message: "Only newly activated rows may issue credentials",
                  });
              }),
          )
          .max(300),
        created: z.number().int().min(0).max(5),
        reused: z.number().int().min(0).max(300),
        failed: z.number().int().min(0).max(5),
        remainingRows: z.array(z.number().int().min(2).max(301)).max(300),
        complete: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine(({ data }, ctx) => {
    if (data.complete !== (data.remainingRows.length === 0))
      ctx.addIssue({
        code: "custom",
        message: "Continuation state is inconsistent",
      });
    if (
      data.created !==
        data.outcomes.filter((r) => r.state === "active").length ||
      data.reused !==
        data.outcomes.filter((r) => r.state === "existing").length ||
      data.failed !== data.outcomes.filter((r) => r.state === "failed").length
    )
      ctx.addIssue({
        code: "custom",
        message: "Import outcome counts are inconsistent",
      });
  });
export type AccountInput = z.infer<typeof accountInput>;
export type AuthSession = z.infer<typeof authSessionResponse>;
export type ImportConfirmation = z.infer<typeof importConfirmationResponse>;

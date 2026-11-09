import { z } from "zod";
import { uuid } from "./index";
export const publishedArticle = z
  .object({
    id: uuid,
    revisionId: uuid,
    title: z.string().max(200),
    summary: z.string().max(20000),
    subject: z.string().max(200),
    body: z.string().max(20000),
    author: z
      .object({
        displayName: z.string(),
        archived: z.boolean(),
        profileId: uuid.nullable(),
      })
      .strict(),
    audience: z.enum(["school", "public"]),
    publishedAt: z.string(),
    indexingEnabled: z.boolean(),
    assets: z
      .array(
        z.object({ id: uuid, filename: z.string(), type: z.string() }).strict(),
      )
      .max(5),
  })
  .strict();

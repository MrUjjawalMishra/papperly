import { z } from "zod";
import { question, key } from "./index";
export const formattedPaper = z
  .object({
    questions: z.array(question).min(1).max(200),
    keys: z.array(key).max(200),
    warnings: z.array(z.string().max(2000)).max(200),
  })
  .strict();

import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { database } from "./database";
it("replays the extended two-school synthetic seed without any Auth passwords", async () => {
  const db = await database(false);
  try {
    await db.exec(readFileSync("supabase/seed.sql", "utf8"));
    expect(
      Number(
        (await db.query<{ n: number }>("select count(*)as n from schools"))
          .rows[0].n,
      ),
    ).toBe(2);
    expect(
      Number(
        (
          await db.query<{ n: number }>(
            "select count(*)as n from memberships where role='student'",
          )
        ).rows[0].n,
      ),
    ).toBe(10);
    expect(
      Number(
        (await db.query<{ n: number }>("select count(*)as n from results"))
          .rows[0].n,
      ),
    ).toBe(3);
    expect(
      Number(
        (
          await db.query<{ n: number }>(
            "select sum(maximum)as n from exam_questions where version_id=(select version_id from results order by published_at limit 1)",
          )
        ).rows[0].n,
      ),
    ).toBe(2500);
  } finally {
    await db.close();
  }
}, 60000);

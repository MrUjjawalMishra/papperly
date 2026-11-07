import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { database } from "./database";
it("replays the native staging RLS harness and rolls back every fixture", async () => {
  const db = await database(false);
  try {
    await db.exec(
      "begin;\n" +
        readFileSync("supabase/seed.sql", "utf8") +
        "\n" +
        readFileSync("tests/live/rls-checks.sql", "utf8") +
        "\nrollback;",
    );
    expect(
      Number(
        (
          await db.query<{ n: number }>(
            "select count(*)as n from public.schools",
          )
        ).rows[0].n,
      ),
    ).toBe(0);
  } finally {
    await db.close();
  }
}, 60000);

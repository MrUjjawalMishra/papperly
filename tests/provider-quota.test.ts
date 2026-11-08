import { expect, it } from "vitest";
import { database, ids, asUser } from "./database";
it("bounds all schools to twenty provider attempts per UTC day and deduplicates live run tokens", async () => {
  const db = await database();
  try {
    for (let i = 0; i < 21; i++) {
      const id = crypto.randomUUID(),
        runToken = crypto.randomUUID();
      await db.query(
        "insert into outbox(id,school_id,kind,dedup_key,payload,status,run_token,lease_until)values($1::uuid,$2::uuid,'format',$1::text,'{}','processing',$3::uuid,now()+interval '2 minutes')",
        [id, i % 2 ? ids.school : ids.otherSchool, runToken],
      );
      const args = JSON.stringify({ id, runToken });
      const call = async () =>
        (
          await db.query<{ data: boolean }>(
            "select runtime_reserve_provider_call($1::jsonb)as data",
            [args],
          )
        ).rows[0].data;
      expect(await call()).toBe(i < 20);
      expect(await call()).toBe(false);
    }
    expect(
      (
        await db.query<{ calls: number }>(
          "select calls from private.ai_provider_usage",
        )
      ).rows[0].calls,
    ).toBe(20);
    await expect(
      asUser(db, ids.teacher, "select runtime_reserve_provider_call('{}')"),
    ).rejects.toThrow("permission denied");
  } finally {
    await db.close();
  }
});

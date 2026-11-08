import { expect, it, vi, afterEach } from "vitest";
import { importConfirm } from "../apps/api/src/imports";
import { provision } from "../apps/api/src/accounts";
import { rpc, type Env, type Session } from "../apps/api/src/platform";
vi.mock("../apps/api/src/accounts", () => ({
  provision: vi.fn(async () => ({
    id: "a0000000-0000-4000-8000-000000000001",
    state: "active",
  })),
}));
vi.mock("../apps/api/src/platform", async () => ({
  ...(await vi.importActual("../apps/api/src/platform")),
  rpc: vi.fn(),
}));
afterEach(() => vi.clearAllMocks());
it("resumes large selections in bounded batches and never starves new rows behind existing identities", async () => {
  const rows = Array.from({ length: 55 }, (_, i) => ({
    row: i + 2,
    identityKey: `row-${i}`,
    state: i < 5 ? "existing" : "new",
    studentId: "a0000000-0000-4000-8000-000000000001",
    preview: {
      name: "Synthetic",
      classId: "b0000000-0000-4000-8000-000000000001",
      className: "9",
      section: "B",
      roll: String(i),
    },
  }));
  vi.mocked(rpc).mockImplementation(async (_env, name) =>
    name === "import_selection" ? rows : (undefined as never),
  );
  const result = await importConfirm(
    {
      jobId: "c0000000-0000-4000-8000-000000000001",
      rows: rows.map((r) => r.row),
    },
    {} as Env,
    { accessToken: "synthetic" } as Session,
  );
  expect(provision).toHaveBeenCalledTimes(5);
  expect(result.reused).toBe(5);
  expect(result.created).toBe(5);
  expect(result.remainingRows).toHaveLength(45);
  expect(result.remainingRows[0]).toBe(12);
  expect(result.complete).toBe(false);
});

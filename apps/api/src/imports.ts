import { z } from "zod";
import { uuid } from "../../../packages/contracts/src/index";
import { importConfirmationInput } from "../../../packages/contracts/src/auth";
import {
  parseRoster,
  rosterTemplate,
} from "../../../packages/domain/src/imports";
import { hash, rpc, ApiError, type Env, type Session } from "./platform";
import { provision } from "./accounts";
export async function importPreview(request: Request, env: Env, s: Session) {
  const url = new URL(request.url),
    classId = uuid.parse(url.searchParams.get("classId"));
  const idempotencyKey = z
    .string()
    .min(8)
    .max(200)
    .parse(request.headers.get("Idempotency-Key"));
  if (!["teacher", "administrator"].includes(s.role))
    throw new ApiError(403, "FORBIDDEN");
  if (!request.body) throw new ApiError(400, "BODY_REQUIRED");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 5 * 1024 * 1024) {
      await reader.cancel();
      throw new ApiError(413, "IMPORT_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    bytes.set(c, o);
    o += c.length;
  }
  let rows;
  try {
    rows = parseRoster(bytes);
  } catch (e) {
    throw new ApiError(
      400,
      e instanceof Error ? e.message : "INVALID_WORKBOOK",
    );
  }
  const checksum = await hash(
    btoa(String.fromCharCode(...bytes.slice(0, 1000))) +
      (await crypto.subtle
        .digest("SHA-256", bytes)
        .then((b) => Array.from(new Uint8Array(b)).join(","))),
  );
  return rpc(
    env,
    "preview_import",
    { classId, checksum, idempotencyKey, rows },
    s.accessToken,
  );
}
export async function importConfirm(input: unknown, env: Env, s: Session) {
  const p = importConfirmationInput.parse(input);
  const rows = await rpc<
    {
      row: number;
      identityKey: string;
      state: string;
      studentId: string;
      preview: Record<string, unknown>;
    }[]
  >(env, "import_selection", p, s.accessToken);
  const outcomes = [];
  // Bound provider/DB subrequests even on Workers Free. A workbook may contain
  // 300 selected rows; callers resume explicitly using remainingRows.
  const existing = rows.filter((row) => row.state === "existing");
  const pending = rows.filter((row) => row.state !== "existing");
  for (const row of [...existing, ...pending.slice(0, 5)]) {
    try {
      if (row.state === "existing") {
        outcomes.push({ row: row.row, state: "existing", id: row.studentId });
        continue;
      }
      const v = row.preview;
      const result = await provision(env, s, {
        role: "student",
        identityKey: row.identityKey,
        name: v.name,
        classId: v.classId,
        className: v.className,
        section: v.section,
        roll: v.roll,
        ...(v.admissionNumber ? { admissionNumber: v.admissionNumber } : {}),
      });
      const state = result.state === "existing" ? "existing" : "active";
      await rpc(
        env,
        "import_row_outcome",
        { jobId: p.jobId, row: row.row, state, studentId: result.id },
        s.accessToken,
      );
      outcomes.push({ row: row.row, ...result });
    } catch {
      await rpc(
        env,
        "import_row_outcome",
        {
          jobId: p.jobId,
          row: row.row,
          state: "failed",
          errorCode: "PROVISIONING_FAILED",
        },
        s.accessToken,
      );
      outcomes.push({
        row: row.row,
        state: "failed",
        error: "PROVISIONING_FAILED",
      });
    }
  }
  return {
    outcomes,
    created: outcomes.filter((r) => r.state === "active").length,
    reused: outcomes.filter((r) => r.state === "existing").length,
    failed: outcomes.filter((r) => r.state === "failed").length,
    remainingRows: pending.slice(5).map((row) => row.row),
    complete: pending.length <= 5,
  };
}
export { rosterTemplate };

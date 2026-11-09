import { z } from "zod";
import { geminiConfigured, geminiJson, GEMINI_MODEL } from "./gemini";
import { validateFormattedPaper } from "../../../packages/domain/src/formatting";
import { reconcileProvisioning } from "./accounts";
import { type Question, type Key } from "../../../packages/contracts/src/index";
import {
  validateGuidance,
  type GuidanceEvidence,
} from "../../../packages/domain/src/guidance";
import {
  renderReport,
  type ExportReport,
} from "../../../packages/domain/src/report-export";
import { validateSuggestion } from "../../../packages/domain/src/index";
import { rpc, ApiError, type Env } from "./platform";
interface Job {
  id: string;
  runToken: string;
  kind: string;
  schoolId: string;
  attempts: number;
  payload: Record<string, unknown>;
  data: GuidanceEvidence & {
    rawText?: string;
    question: Question;
    key: Key;
    response: unknown;
    sourceVersion?: number;
    correction?: string;
    suppressed?: boolean;
  };
}
async function generate(env: Env, job: Job) {
  if (!geminiConfigured(env)) throw new ApiError(503, "AI_NOT_CONFIGURED");
  if (
    !(await rpc<boolean>(env, "runtime_reserve_ai", {
      schoolId: job.schoolId,
      kind: job.kind,
      jobId: job.id,
    }))
  )
    throw new ApiError(503, "AI_QUOTA_EXHAUSTED");
  if (
    !(await rpc<boolean>(env, "runtime_reserve_provider_call", {
      id: job.id,
      runToken: job.runToken,
    }))
  )
    throw new ApiError(503, "AI_QUOTA_EXHAUSTED");
  const data = await geminiJson(env, job.kind, job.data);
  if (job.kind === "format")
    return validateFormattedPaper(job.data.rawText ?? "", data);
  if (job.kind === "subjective")
    return {
      ...validateSuggestion(job.data.question, job.data.key, data),
      model: GEMINI_MODEL,
      promptVersion: "papperly-1",
    };
  try {
    return validateGuidance(job.data, data);
  } catch (error) {
    if (error instanceof Error && /^AI_[A-Z_]+$/.test(error.message))
      throw new ApiError(503, error.message);
    throw new ApiError(503, "INVALID_PROVIDER_OUTPUT");
  }
}
export async function consume(
  batch: MessageBatch<{ id: string; kind: string }>,
  env: Env,
) {
  for (const message of batch.messages) {
    let job: Job | null = null;
    try {
      job = await rpc<Job | null>(env, "runtime_claim", {
        id: message.body.id,
      });
      if (!job) {
        message.ack();
        continue;
      }
      if (job.kind === "asset_copy" || job.kind === "asset_cleanup") {
        await publicationAsset(env, job);
        message.ack();
        continue;
      }
      if (job.kind === "export") {
        await exportReport(env, job);
        message.ack();
        continue;
      }
      if (job.kind === "scan") {
        await scan(env, job);
        message.ack();
        continue;
      }
      if (job.kind === "format") {
        job.data = await rpc(env, "formatting_input", {
          draftId: job.payload.draftId,
        });
      }
      if (!["subjective", "insight", "format"].includes(job.kind))
        throw new ApiError(503, "JOB_HANDLER_NOT_CONFIGURED");
      if (
        job.kind === "insight" &&
        (job.data.correction || job.data.suppressed)
      ) {
        await rpc(env, "runtime_finish", {
          id: job.id,
          runToken: job.runToken,
          status: "done",
          sourceVersion: job.data.sourceVersion,
          result: null,
        });
        message.ack();
        continue;
      }
      if (job.kind === "insight" && !job.data.results?.length) {
        await rpc(env, "runtime_finish", {
          id: job.id,
          runToken: job.runToken,
          status: "unavailable",
          errorCode: "INSUFFICIENT_EVIDENCE",
          sourceVersion: job.data.sourceVersion,
        });
        message.ack();
        continue;
      }
      const result = await generate(env, job);
      if (job.kind === "format")
        await rpc(env, "runtime_formatted", {
          jobId: job.id,
          runToken: job.runToken,
          content: result,
        });
      await rpc(env, "runtime_finish", {
        id: job.id,
        runToken: job.runToken,
        status: "done",
        result,
        sourceVersion: job.data.sourceVersion,
        evidenceFingerprint: job.data.fingerprint,
        model: job.kind === "insight" ? GEMINI_MODEL : undefined,
        promptVersion: job.kind === "insight" ? "papperly-1" : undefined,
      });
      message.ack();
    } catch (e) {
      if (!job) {
        message.retry({ delaySeconds: 30 });
        continue;
      }
      const code = e instanceof ApiError ? e.code : "INVALID_PROVIDER_OUTPUT";
      if (job.kind === "scan")
        await rpc(env, "runtime_scan_finish", {
          jobId: job.id,
          runToken: job.runToken,
          id: job.payload.attachmentId,
          checksum: job.payload.checksum,
          state: code.endsWith("NOT_CONFIGURED")
            ? "unavailable"
            : "quarantined",
        });
      const unavailable =
        code.endsWith("NOT_CONFIGURED") || code === "AI_QUOTA_EXHAUSTED";
      await rpc(env, "runtime_finish", {
        id: job.id,
        runToken: job.runToken,
        status: unavailable
          ? "unavailable"
          : job.attempts >= 4
            ? "failed"
            : "pending",
        errorCode: code,
        sourceVersion: job.data?.sourceVersion,
      });
      message.ack();
    }
  }
}
export async function scheduled(env: Env) {
  await rpc(env, "runtime_sweep", {});
  const assets = await rpc<{ id: string; objectKey: string }[]>(
    env,
    "runtime_asset_cleanup_candidates",
    {},
  );
  for (const asset of assets) await env.FILES.delete(asset.objectKey);
  if (assets.length)
    await rpc(env, "runtime_asset_cleanup_done", {
      ids: assets.map((asset) => asset.id),
    });
  const expired = await rpc<string[]>(env, "runtime_cleanup", {});
  for (const key of expired) {
    await env.FILES.delete(key);
    await rpc(env, "runtime_deleted_export", { objectKey: key });
  }
  const provisions = await rpc<string[]>(
    env,
    "runtime_pending_provisioning",
    {},
  );
  for (const id of provisions) await reconcileProvisioning(env, id);
  const uploads = await rpc<{ id: string; object_key: string }[]>(
    env,
    "runtime_upload_candidates",
    {},
  );
  for (const candidate of uploads) {
    const exists = Boolean(await env.FILES.head(candidate.object_key));
    await rpc(env, "runtime_reconcile_upload", { id: candidate.id, exists });
  }
  const jobs = await rpc<{ id: string; kind: string }[]>(
    env,
    "runtime_dispatch",
    {},
  );
  for (let i = 0; i < jobs.length; i += 100)
    await env.JOBS.sendBatch(jobs.slice(i, i + 100).map((body) => ({ body })));
}

async function publicationAsset(env: Env, job: Job) {
  const plan = await rpc<{
    id: string;
    objectKey: string;
    sourceKey?: string;
    checksum?: string;
    size?: number;
    type?: string;
  } | null>(env, "runtime_asset_plan", {
    jobId: job.id,
    runToken: job.runToken,
  });
  if (plan) {
    if (!plan.objectKey.startsWith(`${job.schoolId}/publications/`))
      throw new ApiError(503, "ASSET_KEY_INVALID");
    if (job.kind === "asset_cleanup") await env.FILES.delete(plan.objectKey);
    else {
      if (
        !plan.sourceKey?.startsWith(`${job.schoolId}/`) ||
        !plan.size ||
        plan.size > 10485760
      )
        throw new ApiError(503, "ASSET_SOURCE_INVALID");
      const object = await env.FILES.get(plan.sourceKey);
      if (!object || object.size !== plan.size)
        throw new ApiError(503, "ASSET_SOURCE_UNAVAILABLE");
      const bytes = await object.arrayBuffer();
      const checksum = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (value) => value.toString(16).padStart(2, "0"),
      ).join("");
      if (checksum !== plan.checksum)
        throw new ApiError(503, "ASSET_CHECKSUM_MISMATCH");
      await env.FILES.put(plan.objectKey, bytes, {
        httpMetadata: { contentType: plan.type ?? "application/octet-stream" },
        customMetadata: { checksum, assetId: plan.id },
      });
    }
    const accepted = await rpc<boolean>(env, "runtime_asset_finish", {
      jobId: job.id,
      runToken: job.runToken,
    });
    if (!accepted && job.kind === "asset_copy")
      await env.FILES.delete(plan.objectKey);
  }
  await rpc(env, "runtime_finish", {
    id: job.id,
    runToken: job.runToken,
    status: "done",
    result: { assetId: job.payload.assetId },
  });
}

async function scan(env: Env, job: Job) {
  if (!env.SCANNER_ENDPOINT || !env.SCANNER_API_KEY)
    throw new ApiError(503, "SCANNER_NOT_CONFIGURED");
  if (!env.SCANNER_ENDPOINT.startsWith("https://"))
    throw new ApiError(503, "SCANNER_REQUIRES_TLS");
  const object = await env.FILES.get(String(job.payload.objectKey));
  if (!object) throw new ApiError(503, "FILE_NOT_FOUND");
  const response = await fetch(env.SCANNER_ENDPOINT, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${env.SCANNER_API_KEY}`,
      "Content-Type": "application/octet-stream",
      "Idempotency-Key": job.id,
      "X-SHA256": String(job.payload.checksum),
    },
    body: object.body,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new ApiError(503, "SCANNER_FAILURE");
  const result = z
    .object({ checksum: z.string(), verdict: z.enum(["clean", "infected"]) })
    .strict()
    .parse(await response.json());
  if (result.checksum !== job.payload.checksum)
    throw new ApiError(503, "SCAN_CHECKSUM_MISMATCH");
  await rpc(env, "runtime_scan_finish", {
    jobId: job.id,
    runToken: job.runToken,
    id: job.payload.attachmentId,
    checksum: result.checksum,
    state: result.verdict === "clean" ? "clean" : "rejected",
  });
  await rpc(env, "runtime_finish", {
    id: job.id,
    runToken: job.runToken,
    status: "done",
    result: { verdict: result.verdict },
  });
}

async function exportReport(env: Env, job: Job) {
  const report = await rpc<ExportReport | null>(env, "runtime_export_data", {
    id: job.payload.exportId,
  });
  if (!report) throw new ApiError(403, "EXPORT_UNAVAILABLE");
  const file = renderReport(report);
  const objectKey = `${report.schoolId}/exports/${report.exportId}.${file.extension}`;
  await env.FILES.put(objectKey, file.content, {
    httpMetadata: { contentType: file.contentType },
  });
  try {
    await rpc(env, "runtime_export_finish", {
      id: report.exportId,
      objectKey,
      sourceFingerprint: report.sourceFingerprint,
    });
  } catch (error) {
    await env.FILES.delete(objectKey);
    throw error;
  }
  await rpc(env, "runtime_finish", {
    id: job.id,
    runToken: job.runToken,
    status: "done",
    result: { exportId: report.exportId },
  });
}

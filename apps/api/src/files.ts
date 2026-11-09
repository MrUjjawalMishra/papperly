import { uuid } from "../../../packages/contracts/src/index";
import { validateFile } from "../../../packages/domain/src/files";
import { ApiError, rpc, type Env, type Session } from "./platform";
export async function upload(request: Request, env: Env, s: Session) {
  const url = new URL(request.url);
  const postId = url.searchParams.get("postId"),
    messageId = url.searchParams.get("messageId"),
    articleRevisionId = url.searchParams.get("articleRevisionId"),
    profileId = url.searchParams.get("profileId");
  if (postId) uuid.parse(postId);
  if (messageId) uuid.parse(messageId);
  if (articleRevisionId) uuid.parse(articleRevisionId);
  if (profileId) uuid.parse(profileId);
  if (!request.body) throw new ApiError(400, "BODY_REQUIRED");
  const parts: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 10485760) {
      await reader.cancel();
      throw new ApiError(413, "FILE_TOO_LARGE");
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let off = 0;
  for (const p of parts) {
    bytes.set(p, off);
    off += p.length;
  }
  const filename = request.headers.get("X-Filename") ?? "",
    type = request.headers.get("Content-Type") ?? "";
  let validated;
  try {
    validated = validateFile(filename, type, bytes);
  } catch (e) {
    throw new ApiError(400, e instanceof Error ? e.message : "INVALID_FILE");
  }
  const checksum = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (
    idempotencyKey !== null &&
    !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)
  )
    throw new ApiError(400, "INVALID_IDEMPOTENCY_KEY");
  const a = await rpc<{
    id: string;
    objectKey: string;
    state: string;
    requiresUpload: boolean;
  }>(
    env,
    "reserve_upload",
    {
      postId,
      messageId,
      articleRevisionId,
      profileId,
      filename: validated.filename,
      type: validated.detectedType,
      size,
      checksum,
      ...(idempotencyKey === null ? {} : { idempotencyKey }),
    },
    s.accessToken,
  );
  if (!a.requiresUpload) return { id: a.id, state: a.state };
  await env.FILES.put(a.objectKey, bytes, {
    httpMetadata: { contentType: type },
    customMetadata: { checksum, attachmentId: a.id },
  });
  await rpc(env, "complete_upload", { id: a.id }, s.accessToken);
  return { id: a.id, state: "quarantined" };
}

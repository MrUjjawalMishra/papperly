import { unzipSync, strFromU8 } from "fflate";
const types: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};
export function validateFile(
  filename: string,
  declared: string,
  bytes: Uint8Array,
) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (
    bytes.length < 4 ||
    bytes.length > 10 * 1024 * 1024 ||
    types[ext] !== declared ||
    [...filename].some((c) => c.charCodeAt(0) < 32) ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.length > 200
  )
    throw Error("UNSUPPORTED_FILE");
  const first = String.fromCharCode(...bytes.slice(0, 8));
  let detected = "";
  if (first.startsWith("%PDF-")) detected = "application/pdf";
  else if (
    bytes[0] === 0x89 &&
    first.slice(1, 4) === "PNG" &&
    bytes[4] === 13 &&
    bytes[5] === 10
  )
    detected = "image/png";
  else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    detected = "image/jpeg";
  else if (first.startsWith("PK") && ["docx", "pptx", "xlsx"].includes(ext)) {
    let total = 0;
    const files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (
          total > 50 * 1024 * 1024 ||
          f.originalSize > 20 * 1024 * 1024 ||
          /vbaProject|embeddings|\.bin$|\.exe$/i.test(f.name)
        )
          throw Error("UNSAFE_OFFICE_DOCUMENT");
        return f.name === "[Content_Types].xml";
      },
    });
    const content = strFromU8(files["[Content_Types].xml"] ?? new Uint8Array());
    const expected =
      ext === "docx"
        ? "wordprocessingml"
        : ext === "pptx"
          ? "presentationml"
          : "spreadsheetml";
    if (
      !content.includes(expected) ||
      /macroEnabled|<!ENTITY|<!DOCTYPE/i.test(content)
    )
      throw Error("UNSAFE_OFFICE_DOCUMENT");
    detected = types[ext];
  }
  if (!detected || detected !== declared) throw Error("TYPE_MISMATCH");
  return {
    filename: filename.replace(/[^a-zA-Z0-9._ -]/g, "_"),
    detectedType: detected,
  };
}

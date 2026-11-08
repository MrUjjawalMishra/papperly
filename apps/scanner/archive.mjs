import { inflateRawSync, crc32 } from "node:zlib";
const FILE_LIMIT = 20 * 1024 * 1024,
  TOTAL_LIMIT = 50 * 1024 * 1024;
export function verifyArchive(
  bytes,
  state = { files: 0, expanded: 0 },
  depth = 0,
) {
  if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) return;
  if (depth > 12) throw Error("SCANNER_ARCHIVE_LIMIT");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (
    end < 0 ||
    end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length ||
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0
  )
    throw Error("SCANNER_ARCHIVE_INVALID");
  const count = bytes.readUInt16LE(end + 10),
    directory = bytes.readUInt32LE(end + 16),
    directorySize = bytes.readUInt32LE(end + 12);
  if (
    count === 65535 ||
    directory === 0xffffffff ||
    directory + directorySize !== end ||
    bytes.readUInt16LE(end + 8) !== count
  )
    throw Error("SCANNER_ARCHIVE_UNSUPPORTED");
  let cursor = directory;
  const names = new Set();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw Error("SCANNER_ARCHIVE_INVALID");
    const flags = bytes.readUInt16LE(cursor + 8),
      method = bytes.readUInt16LE(cursor + 10),
      crc = bytes.readUInt32LE(cursor + 16),
      compressed = bytes.readUInt32LE(cursor + 20),
      expanded = bytes.readUInt32LE(cursor + 24),
      nameLength = bytes.readUInt16LE(cursor + 28),
      extraLength = bytes.readUInt16LE(cursor + 30),
      commentLength = bytes.readUInt16LE(cursor + 32),
      local = bytes.readUInt32LE(cursor + 42);
    if (
      (flags & 0x41) !== 0 ||
      ![0, 8].includes(method) ||
      local === 0xffffffff ||
      compressed === 0xffffffff ||
      expanded === 0xffffffff
    )
      throw Error("SCANNER_ARCHIVE_UNSUPPORTED");
    state.files++;
    state.expanded += expanded;
    if (
      state.files > 1000 ||
      state.expanded > TOTAL_LIMIT ||
      expanded > FILE_LIMIT
    )
      throw Error("SCANNER_ARCHIVE_LIMIT");
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      next > end ||
      local + 30 > directory ||
      bytes.readUInt32LE(local) !== 0x04034b50 ||
      bytes.readUInt16LE(local + 6) !== flags ||
      bytes.readUInt16LE(local + 8) !== method
    )
      throw Error("SCANNER_ARCHIVE_INVALID");
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength),
      key = name.toString("hex");
    if (names.has(key)) throw Error("SCANNER_ARCHIVE_DUPLICATE");
    names.add(key);
    const localNameLength = bytes.readUInt16LE(local + 26),
      dataOffset =
        local + 30 + localNameLength + bytes.readUInt16LE(local + 28);
    if (
      !name.equals(bytes.subarray(local + 30, local + 30 + localNameLength)) ||
      dataOffset + compressed > directory
    )
      throw Error("SCANNER_ARCHIVE_INVALID");
    const compressedBytes = bytes.subarray(dataOffset, dataOffset + compressed);
    let output;
    try {
      output =
        method === 0
          ? compressedBytes
          : inflateRawSync(compressedBytes, {
              maxOutputLength: Math.max(expanded, 1),
            });
    } catch {
      throw Error("SCANNER_ARCHIVE_INVALID_OR_LIMITED");
    }
    if (output.length !== expanded || crc32(output) !== crc)
      throw Error("SCANNER_ARCHIVE_INVALID");
    verifyArchive(output, state, depth + 1);
    cursor = next;
  }
  if (cursor !== end) throw Error("SCANNER_ARCHIVE_INVALID");
}

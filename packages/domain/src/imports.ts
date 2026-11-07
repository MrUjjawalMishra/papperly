import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
export interface RosterRow {
  row: number;
  name: string;
  className: string;
  section: string;
  roll: string;
  admissionNumber?: string;
  error?: string;
}
const array = (v: unknown): Record<string, unknown>[] =>
  v === undefined
    ? []
    : Array.isArray(v)
      ? (v as Record<string, unknown>[])
      : [v as Record<string, unknown>];
export function parseRoster(bytes: Uint8Array): RosterRow[] {
  if (bytes.length > 5 * 1024 * 1024) throw Error("IMPORT_TOO_LARGE");
  let total = 0,
    count = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      total += file.originalSize;
      count++;
      if (
        total > 20 * 1024 * 1024 ||
        file.originalSize > 10 * 1024 * 1024 ||
        count > 1000
      )
        throw Error("IMPORT_EXPANSION_LIMIT");
      if (/vbaProject|externalLinks|embeddings|\.bin$/i.test(file.name))
        throw Error("UNSUPPORTED_WORKBOOK");
      return true;
    },
  });
  if (
    !files["[Content_Types].xml"] ||
    !files["xl/worksheets/sheet1.xml"] ||
    Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
      .length !== 1
  )
    throw Error("ONE_SHEET_REQUIRED");
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    processEntities: false,
    allowBooleanAttributes: false,
  });
  const xml = (name: string) => {
    const text = strFromU8(files[name] ?? new Uint8Array());
    if (/<!DOCTYPE|<!ENTITY|TargetMode="External"/i.test(text))
      throw Error("UNSUPPORTED_WORKBOOK");
    return parser.parse(text) as Record<string, unknown>;
  };
  for (const name of Object.keys(files)) if (name.endsWith(".rels")) xml(name);
  const shared = files["xl/sharedStrings.xml"]
    ? array(
        (xml("xl/sharedStrings.xml").sst as Record<string, unknown>)?.si,
      ).map(
        (s) =>
          s.t ??
          array(s.r)
            .map((r) => r.t)
            .join(""),
      )
    : [];
  const sheet = xml("xl/worksheets/sheet1.xml").worksheet as Record<
    string,
    unknown
  >;
  const data = sheet?.sheetData as Record<string, unknown>;
  const rows = array(data?.row);
  if (rows.length > 301) throw Error("MAXIMUM_300_ROWS");
  const cells = (row: Record<string, unknown>) => {
    const result: Record<string, string> = {};
    for (const c of array(row.c)) {
      if (c.f !== undefined) throw Error("FORMULA_NOT_ALLOWED");
      const ref = String(c["@_r"] ?? "").replace(/\d/g, "");
      let v = c.v ?? (c.is as Record<string, unknown>)?.t ?? "";
      if (c["@_t"] === "s") v = shared[Number(v)] ?? "";
      result[ref] = String(v).trim();
    }
    return result;
  };
  const headers = cells(rows[0] ?? {});
  if (
    headers.A !== "Name" ||
    headers.B !== "Class" ||
    headers.C !== "Section" ||
    headers.D !== "Roll Number"
  )
    throw Error("INVALID_HEADERS");
  const seen = new Set<string>();
  return rows.slice(1).map((row, index) => {
    const c = cells(row);
    const r: RosterRow = {
      row: index + 2,
      name: c.A ?? "",
      className: c.B ?? "",
      section: c.C ?? "",
      roll: c.D ?? "",
      ...(c.E ? { admissionNumber: c.E } : {}),
    };
    const key = [r.className, r.section, r.roll]
      .map((v) => v.toLowerCase())
      .join(":");
    if (
      !r.name ||
      !r.className ||
      !r.section ||
      !r.roll ||
      Object.values(r).some((v) => String(v).length > 200)
    )
      r.error = "REQUIRED_OR_OVERSIZED_FIELD";
    else if (seen.has(key)) r.error = "DUPLICATE_ROSTER";
    seen.add(key);
    return r;
  });
}
export function rosterTemplate() {
  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    "xl/workbook.xml": strToU8(
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Roster" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">' +
        ["Name", "Class", "Section", "Roll Number", "Admission Number"]
          .map(
            (s, i) =>
              `<c r="${String.fromCharCode(65 + i)}1" t="inlineStr"><is><t>${s}</t></is></c>`,
          )
          .join("") +
        "</row></sheetData></worksheet>",
    ),
  });
}

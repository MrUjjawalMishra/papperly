import { safeCsv } from "./index";
export interface ExportReport {
  exportId: string;
  schoolId: string;
  filters: { format?: "csv" | "printable"; [key: string]: unknown };
  sourceFingerprint: string;
  data: {
    school?: { name: string };
    generatedAt?: string;
    results: {
      id: string;
      subject: string;
      title?: string;
      total: number;
      maximum: number;
      publishedAt: string;
    }[];
    assignments?: { title: string; subject: string; state: string }[];
    feedback?: { subject: string; body: string; createdAt: string }[];
    queryMetadata?: {
      id: string;
      subject: string;
      state: string;
      dueAt: string;
      resolvedAt?: string | null;
    }[];
    groups?: { title: string; subject: string; state: string }[];
    enrollmentHistory?: {
      academicYear: string;
      className: string;
      section: string;
      active: boolean;
    }[];
    guidance?: {
      status: string;
      content: unknown;
      correction?: string | null;
      suppressed: boolean;
    } | null;
  };
}
export function renderReport(report: ExportReport) {
  const generatedAt = report.data.generatedAt ?? new Date().toISOString();
  const header = [
    ["Papperly published-result report"],
    ["School", report.data.school?.name ?? report.schoolId],
    ["School ID", report.schoolId],
    ["Generated at (UTC)", generatedAt],
    ["Source fingerprint", report.sourceFingerprint],
    [
      "Source period",
      String(report.filters.from ?? "all available history"),
      String(report.filters.to ?? "current"),
    ],
    ["Filters", JSON.stringify(report.filters)],
    [
      "AI label",
      "Scores and assignment states are server calculated; any study guidance is AI-generated and advisory.",
    ],
    [
      "Privacy",
      "Private export. Previously downloaded copies cannot be remotely revoked.",
    ],
  ];
  const resultRows = report.data.results.map((r) => [
    r.id,
    r.subject,
    r.title ?? "",
    r.total,
    r.maximum,
    r.publishedAt,
  ]);
  if (report.filters.format !== "printable") {
    const rows = [
      ...header,
      [
        "Result",
        "Subject",
        "Assessment",
        "Earned (hundredths)",
        "Maximum (hundredths)",
        "Published at (UTC)",
      ],
      ...resultRows,
    ];
    return {
      content: rows.map((row) => row.map(safeCsv).join(",")).join("\r\n"),
      extension: "csv",
      contentType: "text/csv; charset=utf-8",
    };
  }
  // UTF-8 plain text is deliberately printable without HTML, a browser UI or lossy font substitution.
  const lines = header.map((row) => row.join(": "));
  lines.push(
    "",
    "Published results (marks in hundredths)",
    ...resultRows.map((row) => row.join(" | ")),
  );
  lines.push(
    "",
    "Assignment states",
    ...(report.data.assignments ?? []).map(
      (a) => `${a.title} | ${a.subject} | ${a.state}`,
    ),
  );
  lines.push(
    "",
    "Enrollment history",
    ...(report.data.enrollmentHistory ?? []).map(
      (e) =>
        `${e.academicYear} | ${e.className} ${e.section} | ${e.active ? "active" : "historical"}`,
    ),
  );
  lines.push(
    "",
    "Student-visible teacher feedback",
    ...(report.data.feedback ?? []).map(
      (f) => `${f.subject} | ${f.createdAt} | ${f.body}`,
    ),
  );
  lines.push(
    "",
    "Query metadata (private messages excluded)",
    ...(report.data.queryMetadata ?? []).map(
      (q) =>
        `${q.id} | ${q.subject} | ${q.state} | due ${q.dueAt} | resolved ${q.resolvedAt ?? "not resolved"}`,
    ),
  );
  lines.push(
    "",
    "Group memberships",
    ...(report.data.groups ?? []).map(
      (g) => `${g.title} | ${g.subject} | ${g.state}`,
    ),
  );
  const guidance = report.data.guidance;
  lines.push(
    "",
    "AI-generated advisory study guidance",
    guidance
      ? `${guidance.status}: ${guidance.suppressed ? "withheld" : JSON.stringify(guidance.content)}`
      : "Unavailable for this access scope or source period.",
  );
  if (guidance?.correction)
    lines.push("Teacher correction: " + guidance.correction);
  return {
    content: lines.join("\n") + "\n",
    extension: "txt",
    contentType: "text/plain; charset=utf-8",
  };
}

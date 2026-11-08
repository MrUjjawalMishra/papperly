import { expect, it } from "vitest";
import {
  renderReport,
  type ExportReport,
} from "../packages/domain/src/report-export";
const report: ExportReport = {
  exportId: "report",
  schoolId: "school",
  sourceFingerprint: "source",
  filters: {},
  data: {
    school: { name: "विद्यालय" },
    generatedAt: "2026-11-08T00:00:00Z",
    results: [
      {
        id: "result",
        subject: "=HYPERLINK(unsafe)",
        title: "Comma, newline\nquoted",
        total: 0,
        maximum: 2500,
        publishedAt: "2026-11-01T00:00:00Z",
      },
    ],
    feedback: [
      {
        subject: "Computing",
        body: "अभ्यास करें",
        createdAt: "2026-11-08T00:00:00Z",
      },
    ],
  },
};
it("neutralizes CSV formulas and includes scope, period, school and AI labels", () => {
  const file = renderReport(report);
  expect(file.extension).toBe("csv");
  expect(file.content).toContain("'=HYPERLINK");
  expect(file.content).toContain('"Comma, newline\nquoted"');
  expect(file.content).toContain("विद्यालय");
  expect(file.content).toContain("AI-generated and advisory");
  expect(file.content).toContain("Source period");
});
it("produces printable Unicode text and never includes unselected private properties", () => {
  const file = renderReport({
    ...report,
    filters: { format: "printable" },
    data: { ...report.data, ...{ privateNotes: "SENSITIVE_SENTINEL" } },
  });
  expect(file.extension).toBe("txt");
  expect(file.contentType).toBe("text/plain; charset=utf-8");
  expect(file.content).toContain("अभ्यास करें");
  expect(file.content).toContain("private messages excluded");
  expect(file.content).not.toContain("SENSITIVE_SENTINEL");
});

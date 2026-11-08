import { expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { readFileSync } from "node:fs";
it("validates the committed OpenAPI document and declares every path parameter", async () => {
  const document = JSON.parse(readFileSync("docs/openapi.json", "utf8"));
  await SwaggerParser.validate(structuredClone(document), {
    resolve: { external: false },
  });
  const ids = new Set<string>();
  for (const [path, item] of Object.entries(document.paths) as [
    string,
    Record<
      string,
      {
        operationId: string;
        parameters?: { name: string; in: string; required: boolean }[];
      }
    >,
  ][]) {
    for (const operation of Object.values(item)) {
      expect(ids.has(operation.operationId)).toBe(false);
      ids.add(operation.operationId);
      for (const match of path.matchAll(/\{([^}]+)\}/g))
        expect(
          operation.parameters?.some(
            (p) => p.name === match[1] && p.in === "path" && p.required,
          ),
        ).toBe(true);
    }
  }
  expect(JSON.stringify(document)).not.toContain('"const":');
});

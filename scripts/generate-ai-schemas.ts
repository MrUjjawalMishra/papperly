import process from "node:process";
import { readFileSync, writeFileSync } from "node:fs";
import { format } from "prettier";
import { zodToJsonSchema } from "zod-to-json-schema";
import { formattedPaper } from "../packages/contracts/src/ai";
import { suggestion, guidance } from "../packages/contracts/src/index";
const schemas = Object.fromEntries(
  Object.entries({
    format: formattedPaper,
    subjective: suggestion,
    insight: guidance,
  }).map(([name, schema]) => {
    const { $schema: _, ...body } = zodToJsonSchema(schema, {
      $refStrategy: "none",
    });
    void _;
    return [name, body];
  }),
);
const file = "packages/contracts/src/ai-schemas.ts";
const source = await format(
  "// Generated from runtime Zod contracts; run npm run contracts:generate.\nexport const aiOutputSchemas=" +
    JSON.stringify(schemas) +
    " as const;\n",
  { parser: "typescript" },
);
if (process.argv.includes("--check")) {
  if (readFileSync(file, "utf8") !== source)
    throw Error("AI output schema drift; run npm run contracts:generate");
} else writeFileSync(file, source);

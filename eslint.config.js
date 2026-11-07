import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  { ignores: ["**/dist/**", "**/.wrangler/**", "node_modules/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      globals: {
        fetch: "readonly",
        URL: "readonly",
        AbortSignal: "readonly",
        Response: "readonly",
        crypto: "readonly",
      },
    },
  },
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
);

import process from "node:process";
import { readFileSync } from "node:fs";
const expected = JSON.parse(readFileSync("docs/staging-target.json", "utf8"));
for (const [field, variable] of Object.entries({
  repository: "GITHUB_REPOSITORY",
  cloudflareAccountId: "CLOUDFLARE_ACCOUNT_ID",
  supabaseProjectRef: "SUPABASE_PROJECT_REF",
  apiUrl: "STAGING_API_URL",
})) {
  if (!expected[field] || expected[field] !== process.env[variable])
    throw Error("Unverified or mismatched staging target: " + field);
}
if (expected.verified !== true)
  throw Error("Staging target identity has not been verified");

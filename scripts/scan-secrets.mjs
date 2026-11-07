import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import console from "node:console";
const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp_|github_pat_)[a-zA-Z0-9_]{20,}/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\b/,
];
for (const path of tracked) {
  if (path.endsWith("package-lock.json")) continue;
  const content = readFileSync(path, "utf8");
  if (patterns.some((p) => p.test(content)))
    throw Error("Potential secret detected in " + path);
}
console.log("Local credential-pattern scan passed; CI also uses gitleaks.");

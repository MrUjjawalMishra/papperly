import process from "node:process";
import console from "node:console";
const base = process.env.STAGING_API_URL;
if (!base?.startsWith("https://"))
  throw Error(
    "STAGING_API_URL must identify the verified HTTPS staging Worker",
  );
for (const path of ["/healthz", "/readyz"]) {
  const response = await fetch(new URL(path, base), {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error(path + " failed with " + response.status);
  const data = await response.json();
  if (data.release !== process.env.EXPECTED_RELEASE_SHA)
    throw Error("Release SHA mismatch");
  console.log(path, data.status);
}
const unauth = await fetch(new URL("/v1/results", base));
if (unauth.status !== 401)
  throw Error("Unauthenticated results were not denied");
// Health is only one smoke gate. The full synthetic multi-role suite must run separately.
console.log(
  "Health/readiness/SHA/anonymous-denial checks passed. Full live workflow is still required.",
);

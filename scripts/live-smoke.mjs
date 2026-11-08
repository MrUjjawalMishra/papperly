import process from "node:process";
import console from "node:console";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export async function verifyLiveSmoke(
  { base, expectedRelease },
  fetcher = fetch,
  pause = delay,
) {
  if (
    !base?.startsWith("https://") ||
    !/^[a-f0-9]{40}$/.test(expectedRelease ?? "")
  )
    throw Error(
      "Verified HTTPS staging URL and immutable release SHA required",
    );
  const checks = [];
  for (const path of ["/healthz", "/readyz"]) {
    let lastFailure;
    for (let attempt = 0; attempt < 6; attempt++) {
      let response;
      try {
        response = await fetcher(new URL(path, base), {
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        lastFailure = "transport failure";
      }
      if (response) {
        if (!response.ok && ![404, 502, 503, 504].includes(response.status))
          throw Error(`${path} failed with ${response.status}`);
        const data = await response.json().catch(() => null);
        if (
          response.ok &&
          data?.release === expectedRelease &&
          data.status === (path === "/healthz" ? "ok" : "ready")
        ) {
          checks.push({
            path,
            status: response.status,
            release: data.release,
            attempts: attempt + 1,
          });
          lastFailure = null;
          break;
        }
        lastFailure = response.ok
          ? "Release SHA or readiness mismatch"
          : `HTTP ${response.status}`;
      }
      if (attempt < 5) await pause(2000);
    }
    if (lastFailure)
      throw Error(
        `${path} failed after bounded propagation checks: ${lastFailure}`,
      );
  }
  const response = await fetcher(new URL("/v1/results", base), {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (response.status !== 401)
    throw Error("Unauthenticated results were not denied");
  checks.push({ path: "/v1/results", status: response.status });
  return checks;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const checks = await verifyLiveSmoke({
    base: process.env.STAGING_API_URL,
    expectedRelease: process.env.EXPECTED_RELEASE_SHA,
  });
  for (const check of checks)
    console.log(check.path, check.status, "attempts", check.attempts ?? 1);
  console.log(
    "Health/readiness/SHA/anonymous-denial checks passed. Full live workflow is still required.",
  );
}

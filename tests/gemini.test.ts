import { expect, it } from "vitest";
import { geminiJson, GEMINI_MODEL } from "../apps/api/src/gemini";
import type { Env } from "../apps/api/src/platform";
const env = {
  AI_PROVIDER: "gemini-free",
  AI_MODEL: GEMINI_MODEL,
  GEMINI_API_KEY: crypto.randomUUID(),
  GEMINI_FREE_TIER_CONFIRMED: "true",
} as Env;
function result(
  payload: unknown = {
    resultIds: [],
    strengths: [],
    practice: [],
    sufficiency: "more-evidence-needed",
  },
) {
  return Response.json({
    model: GEMINI_MODEL,
    status: "completed",
    steps: [
      {
        type: "model_output",
        content: [{ type: "text", text: JSON.stringify(payload) }],
      },
    ],
  });
}
it("uses only the pinned stateless free-tier API with no tools or model fallback", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const output = await geminiJson(
    env,
    "insight",
    { results: [] },
    async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return result();
    },
  );
  const body = JSON.parse(String(calls[0].init.body));
  expect(body.store).toBe(false);
  expect(body.model).toBe(GEMINI_MODEL);
  expect(body.tools).toBeUndefined();
  expect(body.response_format.mime_type).toBe("application/json");
  expect(body.generation_config.max_output_tokens).toBe(16384);
  expect(calls[0].url).not.toContain(env.GEMINI_API_KEY!);
  expect(calls[0].init.redirect).toBe("error");
  expect(output).toMatchObject({ resultIds: [] });
});
it("makes no provider call without explicit free-project confirmation or for a different model", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return result();
  };
  for (const bad of [
    { GEMINI_FREE_TIER_CONFIRMED: "false" },
    { AI_MODEL: "paid-or-auto" },
    { GEMINI_API_KEY: "" },
  ])
    await expect(
      geminiJson({ ...env, ...bad } as Env, "insight", {}, fetcher),
    ).rejects.toThrow("AI_NOT_CONFIGURED");
  expect(calls).toBe(0);
});
it("preserves rate-limit and bounded upstream failures without leaking provider bodies", async () => {
  await expect(
    geminiJson(
      env,
      "insight",
      {},
      async () => new Response("private-provider-sentinel", { status: 429 }),
    ),
  ).rejects.toThrow("AI_PROVIDER_RATE_LIMITED");
  await expect(
    geminiJson(
      env,
      "insight",
      {},
      async () => new Response("private-provider-sentinel", { status: 500 }),
    ),
  ).rejects.toThrow("AI_PROVIDER_FAILURE");
  await expect(
    geminiJson(env, "insight", {}, async () => {
      throw Error(env.GEMINI_API_KEY);
    }),
  ).rejects.toThrow("AI_PROVIDER_TRANSPORT_FAILURE");
});
it("rejects model rerouting, incomplete generations, tool outputs and malformed JSON", async () => {
  for (const response of [
    Response.json({ model: "changed", status: "completed", steps: [] }),
    Response.json({ model: GEMINI_MODEL, status: "in_progress", steps: [] }),
    Response.json({
      model: GEMINI_MODEL,
      status: "completed",
      steps: [{ type: "function_call" }],
    }),
    Response.json({
      model: GEMINI_MODEL,
      status: "completed",
      steps: [
        { type: "model_output", content: [{ type: "text", text: "not json" }] },
      ],
    }),
  ])
    await expect(
      geminiJson(env, "insight", {}, async () => response),
    ).rejects.toThrow(/^AI_/);
});
it("bounds input and streamed response bytes before parsing", async () => {
  await expect(
    geminiJson(env, "insight", "x".repeat(256001), async () => result()),
  ).rejects.toThrow("AI_INPUT_TOO_LARGE");
  await expect(
    geminiJson(
      env,
      "insight",
      {},
      async () => new Response("x".repeat(512001)),
    ),
  ).rejects.toThrow("AI_OUTPUT_TOO_LARGE");
});

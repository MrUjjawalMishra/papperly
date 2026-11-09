import { afterEach, expect, it, vi } from "vitest";
import { handle } from "../apps/api/src/index";
import type { Env } from "../apps/api/src/platform";
import { uid } from "./fixtures";
const record = {
  id: uid(1),
  revisionId: uid(2),
  title: "Synthetic article",
  summary: "Approved summary",
  subject: "Computing",
  body: "<script>bad()</script>\n\n**Study**",
  author: { displayName: "Approved teacher", archived: false, profileId: null },
  audience: "public",
  publishedAt: new Date().toISOString(),
  indexingEnabled: false,
  assets: [],
};
const env = {
  SUPABASE_URL: "https://synthetic.invalid",
  SUPABASE_ANON_KEY: "synthetic-public",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-server",
  ALLOWED_ORIGINS: "",
  FILES: {
    get: vi.fn(async () => ({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("Synthetic file"));
          controller.close();
        },
      }),
    })),
  },
} as unknown as Env;
afterEach(() => vi.unstubAllGlobals());
function mock(denied = false) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("runtime_rate")) return Response.json(true);
      if (url.endsWith("article_detail")) return Response.json(record);
      if (url.endsWith("profile_articles")) return Response.json([]);
      if (url.endsWith("publication_asset"))
        return denied
          ? Response.json({ message: "ASSET_UNAVAILABLE" }, { status: 403 })
          : Response.json({
              objectKey: "synthetic/private-copy",
              filename: "approved.pdf",
              type: "application/pdf",
            });
      throw Error("Unexpected endpoint");
    }),
  );
}
it("returns only approved JSON with escaped article HTML and no raw body, secret or default indexing", async () => {
  mock();
  const response = await handle(
    new Request(`https://api.test/v1/public/articles/${uid(1)}`),
    env,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("application/json");
  const { data } = (await response.json()) as { data: Record<string, string> };
  expect(data.body).toBeUndefined();
  expect(data.bodyHtml).not.toContain("<script>");
  expect(data.bodyHtml).toContain("<strong>Study</strong>");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(JSON.stringify(data)).not.toContain("synthetic-server");
});
it("routes profile article metadata before the profile-detail path and validates bounded filters", async () => {
  mock();
  const response = await handle(
    new Request(
      `https://api.test/v1/public/profiles/${uid(3)}/articles?limit=5`,
    ),
    env,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: [] });
  expect(
    (
      await handle(
        new Request(
          `https://api.test/v1/public/profiles/${uid(3)}/articles?limit=500`,
        ),
        env,
      )
    ).status,
  ).toBe(400);
});
it("streams an authorized private copy as a forced download and never reads storage after audience denial", async () => {
  mock();
  const response = await handle(
    new Request(`https://api.test/v1/public/assets/${uid(4)}`),
    env,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Disposition")).toContain("attachment;");
  expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
  expect(await response.text()).toBe("Synthetic file");
  const get = vi.mocked(env.FILES.get);
  get.mockClear();
  mock(true);
  expect(
    (
      await handle(
        new Request(`https://api.test/v1/public/assets/${uid(4)}`),
        env,
      )
    ).status,
  ).toBe(403);
  expect(get).not.toHaveBeenCalled();
});

import { expect, it } from "vitest";
import { renderArticleContent } from "../packages/domain/src/article-content";
it("escapes HTML and code without allowing script/event/style markup", () => {
  const html = renderArticleContent(
    "<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n\n```html\n<script>bad</script>\n```",
  );
  expect(html).not.toMatch(/<script|<img|<style/);
  expect(html).toContain("&lt;script&gt;");
});
it("permits explicit HTTPS links while rejecting dangerous, relative and embedded-image targets", () => {
  const html = renderArticleContent(
    "[safe](https://example.org/lesson) [bad](javascript:alert%281%29) [local](/v1/files/private) ![remote](https://example.org/track.png) [data](data:text/html,bad)",
  );
  expect(html).toContain('href="https://example.org/lesson"');
  expect(html).toContain('rel="nofollow noopener noreferrer"');
  expect(html).not.toMatch(/href="(?:javascript:|data:|\/v1)|<img/);
});
it("bounds source size and preserves non-Latin approved text", () => {
  expect(renderArticleContent("**अध्ययन**")).toContain(
    "<strong>अध्ययन</strong>",
  );
  expect(() => renderArticleContent("x".repeat(20001))).toThrow(
    "ARTICLE_TOO_LARGE",
  );
});

import { publishedArticle } from "../../../packages/contracts/src/publication";
import { renderArticleContent } from "../../../packages/domain/src/article-content";
import { ApiError } from "./platform";
export function articleProjection(value: unknown) {
  const parsed = publishedArticle.safeParse(value);
  if (!parsed.success) throw new ApiError(500, "RESPONSE_VALIDATION_FAILED");
  const { body, ...approved } = parsed.data;
  return { ...approved, bodyHtml: renderArticleContent(body) };
}

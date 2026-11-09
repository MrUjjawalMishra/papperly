import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  maxNesting: 20,
}).disable("image");
markdown.validateLink = (value: string) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !/^\/v1\/(files|exports|query-messages)\//.test(url.pathname)
    );
  } catch {
    return false;
  }
};
const renderLink = markdown.renderer.rules.link_open;
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet("rel", "nofollow noopener noreferrer");
  return renderLink
    ? renderLink(tokens, index, options, env, renderer)
    : renderer.renderToken(tokens, index, options);
};

export function renderArticleContent(source: string) {
  if (source.length > 20000) throw Error("ARTICLE_TOO_LARGE");
  return markdown.render(source);
}

/**
 * Convert a fetched HTML page into markdown text for the chat model.
 *
 * Readability extracts the article content (dropping nav/sidebar/footer
 * chrome that would waste the model's reading budget) and turndown converts
 * the remaining HTML to markdown. Both libraries are imported lazily so they
 * end up in their own chunk, loaded only when the chat fetches a page.
 */

const STRIP_SELECTORS = "script,style,noscript,nav,header,footer,iframe,svg";

export async function htmlToMarkdown(
  html: string,
  url: string,
): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const [{ Readability }, { default: TurndownService }, { gfm }] =
    await Promise.all([
      import("@mozilla/readability"),
      import("turndown"),
      import("@joplin/turndown-plugin-gfm"),
    ]);

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  turndown.use(gfm);

  // Page chrome is never content, whichever extraction path runs below.
  for (const el of doc.body.querySelectorAll(STRIP_SELECTORS)) el.remove();

  // Readability mutates the document it parses, so give it a clone.
  const article = new Readability(doc.cloneNode(true) as Document).parse();

  const markdown = article?.content
    ? turndown.turndown(article.content)
    : turndown.turndown(doc.body.innerHTML);

  const title = article?.title || doc.title;
  const header = `${title ? `# ${title}\n` : ""}Source: ${url}\n\n`;
  return header + markdown.trim();
}

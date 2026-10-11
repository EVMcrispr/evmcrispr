import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** The address a link may lead to: `https:` and nothing else. */
export function httpsUrl(href: unknown): URL | null {
  if (typeof href !== "string") return null;
  try {
    const url = new URL(href);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * A line of console output. It is text a script chose to print, so by
 * default it is shown as the characters it is. `markdown` is for the
 * output of a run made by this page, and even then the text is the
 * script's: it never makes the page fetch anything or lead somewhere
 * unseen.
 *  - No image: an image is a request to an address the script chose, made
 *    by merely printing a line. Its alt text is shown instead.
 *  - A link only to an `https:` address, opened in a new tab, with the
 *    address shown beside its text. Any other link is its text.
 *  - No raw HTML (the renderer does not parse it).
 */
export function ConsoleMarkdown({
  children,
  markdown = false,
}: {
  children: string;
  markdown?: boolean;
}) {
  if (!markdown)
    return <span className="whitespace-pre-wrap break-words">{children}</span>;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        img: ({ alt }) => <span>{alt}</span>,
        a: ({ href, children }) => {
          const url = httpsUrl(href);
          if (!url) return <span>{children}</span>;
          return (
            <>
              <a
                href={url.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-evm-green-300 underline"
              >
                {children}
              </a>
              <span className="break-all text-sm opacity-70">
                {" "}
                ({url.href})
              </span>
            </>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

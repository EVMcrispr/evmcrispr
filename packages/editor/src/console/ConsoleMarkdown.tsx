import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown as the console renders it: GFM, links open in a new tab. */
export function ConsoleMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children, ...props }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-evm-green-300 underline"
            {...props}
          >
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

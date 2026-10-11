import { PROSE } from "@evmcrispr/editor";
import { Button, CodeBlock } from "@repo/ui";
import { FlaskConical } from "@repo/ui/icons";
import type { Components } from "react-markdown";

/** Experimental marker emoji embedded in generated docs (badge lines,
 *  option-table rows) — rendered as the lucide flask-conical icon. */
const EXPERIMENTAL_MARKER = "⚗️";

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/** Rehype plugin: swap ⚗️ text occurrences for <experimental-flask/>
 *  elements, which the components map renders as the lucide icon. */
export function rehypeExperimentalFlask() {
  const visit = (node: HastNode) => {
    if (node.tagName === "code" || node.tagName === "pre") return;
    const children = node.children;
    if (!children) return;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child.type === "text" && child.value?.includes(EXPERIMENTAL_MARKER)) {
        const parts = child.value.split(EXPERIMENTAL_MARKER);
        const replacement: HastNode[] = [];
        parts.forEach((part, j) => {
          if (part) replacement.push({ type: "text", value: part });
          if (j < parts.length - 1) {
            replacement.push({
              type: "element",
              tagName: "experimental-flask",
              properties: {},
              children: [],
            });
          }
        });
        children.splice(i, 1, ...replacement);
      } else {
        visit(child);
      }
    }
  };
  return (tree: HastNode) => visit(tree);
}

function ExperimentalFlask() {
  return (
    <span title="Experimental" className="inline-block align-text-bottom">
      <FlaskConical aria-hidden className="size-3.5" />
    </span>
  );
}

function extractCodeProps(children: React.ReactNode) {
  const child = Array.isArray(children) ? children[0] : children;
  if (child && typeof child === "object" && "props" in child) {
    const props = child.props as {
      className?: string;
      children?: React.ReactNode;
    };
    // Unwrap nested children — the code override may wrap the text in another element
    const text =
      typeof props.children === "string"
        ? props.children
        : typeof (props.children as { props?: { children?: string } })?.props
              ?.children === "string"
          ? (props.children as { props: { children: string } }).props.children
          : null;
    if (text === null) return null;
    return {
      lang: props.className?.replace("language-", "").trim() || undefined,
      code: text.replace(/\n$/, ""),
    };
  }
  return null;
}

function Pre({ children }: React.ComponentProps<"pre">) {
  const codeProps = extractCodeProps(children);
  if (codeProps) {
    return (
      <CodeBlock
        code={codeProps.code}
        lang={codeProps.lang}
        className="overflow-x-auto border-2 border-line text-caption [&_code]:bg-transparent! [&_code]:py-0.5! [&_code]:text-caption! [&_pre]:m-0! [&_pre]:bg-surface-well! [&_pre]:p-3!"
      />
    );
  }
  return (
    <pre className="overflow-x-auto rounded-(--radius) border-2 border-line bg-surface-well p-3 text-caption">
      {children}
    </pre>
  );
}

function InlineCode({ children, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      className="rounded-(--radius) bg-surface-active px-1 py-0.5 font-mono text-caption text-fg"
      {...props}
    >
      {children}
    </code>
  );
}

function Anchor({ href, children, ...props }: React.ComponentProps<"a">) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-success underline"
      {...props}
    >
      {children}
    </a>
  );
}

function Table({ children, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="my-2 overflow-x-auto rounded-(--radius) border-2 border-line">
      <table className="m-0 w-full text-caption" {...props}>
        {children}
      </table>
    </div>
  );
}

/**
 * How a markdown link should behave: a callback opens it inside the panel,
 * "plain" renders non-clickable text (unresolvable doc link), and null falls
 * back to a regular external link.
 */
export type DocLinkResolution = (() => void) | "plain" | null;

export function createMarkdownComponents(
  resolveDocLink?: (href: string) => DocLinkResolution,
): Components {
  return {
    pre: Pre,
    code: InlineCode,
    a: ({ href, children, ...props }) => {
      const resolution = href ? (resolveDocLink?.(href) ?? null) : null;
      if (typeof resolution === "function") {
        return (
          <Button
            type="button"
            variant="link"
            size="row"
            className="inline-flex"
            onClick={resolution}
          >
            {children}
          </Button>
        );
      }
      if (resolution === "plain") return <span>{children}</span>;
      return (
        <Anchor href={href} {...props}>
          {children}
        </Anchor>
      );
    },
    table: Table,
    "experimental-flask": ExperimentalFlask,
  } as Components;
}

export const markdownComponents: Components = createMarkdownComponents();

export { PROSE };

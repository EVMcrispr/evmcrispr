import type { Components } from "react-markdown";
import { CodeBlock } from "./CodeBlock";

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

export const markdownComponents: Components = {
  pre: Pre,
  code: InlineCode,
  a: Anchor,
  table: Table,
};

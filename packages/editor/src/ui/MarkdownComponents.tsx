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
        className="rounded-md border border-foreground/10 text-xs [&_pre]:p-3! [&_pre]:m-0! [&_pre]:bg-foreground/5! [&_code]:text-xs! [&_code]:bg-transparent! [&_code]:py-0.5! overflow-x-auto"
      />
    );
  }
  return (
    <pre className="bg-foreground/5 border border-foreground/10 rounded-md p-3 overflow-x-auto text-xs">
      {children}
    </pre>
  );
}

function InlineCode({ children, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      className="text-evm-orange-300 bg-foreground/10 px-1 py-0.5 rounded text-xs"
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
      className="text-evm-green-300 underline"
      {...props}
    >
      {children}
    </a>
  );
}

function Table({ children, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs" {...props}>
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

import { useShiki } from "@evmcrispr/editor";
import { useMemo } from "react";

export function CodeBlock({
  code,
  lang = "evml",
  className,
}: {
  code: string;
  lang?: string;
  className?: string;
}) {
  const highlighter = useShiki();

  const html = useMemo(() => {
    if (!highlighter) return null;
    try {
      return highlighter.codeToHtml(code, {
        lang,
        theme: "evml-dark",
      });
    } catch {
      return null;
    }
  }, [highlighter, code, lang]);

  if (!html) {
    return (
      <pre className={className}>
        <code>{code}</code>
      </pre>
    );
  }

  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki generates trusted HTML
    <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

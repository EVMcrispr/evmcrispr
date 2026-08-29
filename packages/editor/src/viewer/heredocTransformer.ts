import type { ShikiTransformer } from "shiki";
import {
  findHeredocRanges,
  type HeredocRange,
  heredocKindClass,
} from "../heredocRanges";

/** Grammar scopes of the `<<<SOL` / `SOL` fence tokens. */
const FENCE_SCOPE = "punctuation.definition.heredoc";

/**
 * Tags each body `.line` of a `<<<SENTINEL … SENTINEL` block with
 * `heredoc-block heredoc-<kind>` (bar + tint) and each fence token with
 * `heredoc-fence heredoc-<kind>` (kind color). Mirrors the Monaco
 * decorations in `MonacoEditor.tsx`. Needs `includeExplanation` on the
 * `codeToHtml` call to recognize fence tokens by scope.
 */
export function evmlHeredocTransformer(): ShikiTransformer {
  // `codeToHtml` is synchronous, so a single-entry cache keyed by the
  // source keeps the scan to one pass per render.
  let cached: { source: string; ranges: HeredocRange[] } | null = null;
  const rangesFor = (source: string) => {
    if (!cached || cached.source !== source) {
      cached = { source, ranges: findHeredocRanges(source) };
    }
    return cached.ranges;
  };
  return {
    name: "evml:heredoc",
    line(node, lineNumber) {
      const range = rangesFor(this.source).find(
        (r) => lineNumber > r.startLine && lineNumber < r.endLine,
      );
      if (range) {
        this.addClassToHast(node, [
          "heredoc-block",
          heredocKindClass(range.sentinel),
        ]);
      }
    },
    span(node, line, _col, _lineEl, token) {
      const isFence = token.explanation?.some((e) =>
        e.scopes.some((s) => s.scopeName.startsWith(FENCE_SCOPE)),
      );
      if (!isFence) return;
      const range = rangesFor(this.source).find(
        (r) => line === r.startLine || line === r.endLine,
      );
      if (range) {
        this.addClassToHast(node, [
          "heredoc-fence",
          heredocKindClass(range.sentinel),
        ]);
      }
    },
  };
}

import type { ShikiTransformer, ThemedToken } from "shiki";

// Minimal hast shapes the Shiki transformer hands us. Defined inline to
// avoid pulling in `@types/hast` for two interfaces.
type HastText = { type: "text"; value: string };
type HastElement = {
  type: "element";
  tagName: string;
  properties: Record<string, unknown>;
  children: (HastElement | HastText)[];
};

/** Address literals don't have a dedicated grammar scope (they fall
 *  through to `constant.numeric.evml`), so we still pattern-match them. */
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Grammar scopes whose tokens `evm.getHoverInfo` can resolve. Keep in
 *  sync with `packages/ui/src/grammars/evml.tmLanguage.json`. Scope
 *  matching (rather than color or hard-coded keyword lists) means:
 *   - new keywords / module commands become hoverable automatically,
 *   - string / comment occurrences of the same literal text never
 *     light up,
 *   - theme tweaks don't silently break the popovers. */
const HOVERABLE_SCOPES = new Set([
  "keyword.control.evml",
  "keyword.control.module-command.evml",
  "entity.name.tag.option.evml",
  "variable.other.evml",
  "entity.name.function.helper.evml",
]);

function hasHoverableScope(token: ThemedToken): boolean {
  const explanations = token.explanation;
  if (!explanations) return false;
  for (const exp of explanations) {
    for (const s of exp.scopes) {
      if (HOVERABLE_SCOPES.has(s.scopeName)) return true;
    }
  }
  return false;
}

/** Decide whether `trimmed` is a token kind we know how to render a
 *  popover for. Mirrors what `getTokenAtCol` in `@evmcrispr/core`
 *  recognises, so every hovered span resolves to a real `HoverInfo`
 *  (or is auto-dismissed by `HoverPopover`). */
function isHoverTarget(trimmed: string, token: ThemedToken): boolean {
  if (ADDRESS_RE.test(trimmed)) return true;
  return hasHoverableScope(token);
}

/**
 * Mirrors what `@shikijs/twoslash` does for TypeScript code, but driven
 * by EVMcrispr's own hover token rules. Tags every address / `@helper` /
 * `$variable` / `--option` / command-keyword token with the
 * `evml-hover-target` class plus `data-hover-line` / `data-hover-col`
 * so a single popover at the viewer root can resolve the right
 * `getHoverInfo({ line, col })` lookup on pointer / focus / tap.
 *
 * Requires the highlighter to be invoked with
 * `includeExplanation: "scopeName"` so each token reports its grammar
 * scope. Scope info is the lightest reliable signal Shiki exposes — it
 * survives theme changes and never confuses a literal `set` inside a
 * string with the actual command keyword.
 *
 * Shiki bundles leading whitespace into the next coloured token (e.g.
 * `" $sender"` arrives as a single span with `col` pointing at the
 * space). We split the children so the leading/trailing whitespace
 * renders as a bare text node and only the meaningful slice is wrapped
 * in the underlined `.evml-hover-target` span — otherwise the dotted
 * underline would extend over the leading space, which reads as
 * "everything is hoverable" instead of "this identifier is". The
 * `data-hover-col` is shifted past the skipped characters so
 * `getTokenAtCol` lands on the actual identifier; without that the
 * popover would briefly flash a spinner before closing.
 *
 * The outer span keeps Shiki's inline `style` (colour) so the colour
 * still covers the whitespace and there's no visible seam.
 *
 * No styling here — the hover affordance lives in `index.css` (a subtle
 * dotted underline) and the popover renders from React.
 */
export function evmlTwoslashTransformer(): ShikiTransformer {
  return {
    name: "evml:twoslash",
    span(hast, line, col, _lineElement, token) {
      const content = token.content;
      const trimmedStart = content.length - content.trimStart().length;
      const trimmed = content.slice(trimmedStart).trimEnd();
      const trimmedEnd = content.length - trimmedStart - trimmed.length;
      if (trimmed.length === 0) return;

      if (!isHoverTarget(trimmed, token)) return;

      const leading = content.slice(0, trimmedStart);
      const trailing =
        trimmedEnd > 0 ? content.slice(content.length - trimmedEnd) : "";

      const inner: HastElement = {
        type: "element",
        tagName: "span",
        properties: {
          class: "evml-hover-target",
          "data-hover-line": String(line),
          "data-hover-col": String(col + trimmedStart),
          "data-hover-len": String(trimmed.length),
        },
        children: [{ type: "text", value: trimmed }],
      };

      const newChildren: (HastElement | HastText)[] = [];
      if (leading) newChildren.push({ type: "text", value: leading });
      newChildren.push(inner);
      if (trailing) newChildren.push({ type: "text", value: trailing });

      (hast as unknown as HastElement).children = newChildren;
    },
  };
}

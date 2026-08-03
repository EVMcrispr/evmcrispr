import type { ShikiTransformer, ThemedToken } from "shiki";

/** Monaco's vs-dark bracket-pair palette (`editorBracketHighlight.
 *  foreground1..3`; 4–6 are unset in vs-dark, so the cycle length is 3).
 *  The editor enables `bracketPairColorization`, so the viewer mirrors
 *  the same colors here. */
const BRACKET_COLORS = ["#FFD700", "#DA70D6", "#179FFF"];

/** Monaco's `editorBracketHighlight.unexpectedBracket.foreground`
 *  (rgba(255, 18, 18, 0.8)) — an unmatched closing bracket. */
const UNEXPECTED_BRACKET_COLOR = "#FF1212CC";

const OPEN_BRACKETS = new Set(["(", "[", "{"]);
const BRACKET_RE = /[()[\]{}]/;

/** Monaco skips brackets inside strings and comments (it consults the
 *  tokenizer's standard token types), so `"balanceOf(address)"` keeps its
 *  string color. Scope prefixes cover EVML plus the embedded heredoc
 *  grammars (solidity / json / circom / noir). */
function isStringOrComment(token: ThemedToken): boolean {
  const explanations = token.explanation;
  if (!explanations) return false;
  for (const exp of explanations) {
    for (const s of exp.scopes) {
      if (
        s.scopeName.startsWith("string") ||
        s.scopeName.startsWith("comment")
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Replicates Monaco's bracket-pair colorization for the Shiki viewer:
 * `()[]{}` outside strings/comments are tinted by nesting depth with the
 * same cycling palette the editor uses. Runs on the themed tokens before
 * HTML generation, splitting any token that contains brackets so each
 * bracket becomes its own token with the depth color.
 *
 * Requires `includeExplanation` (any mode) on the `codeToHtml` call so
 * string/comment tokens can be recognized by grammar scope.
 */
export function evmlBracketColorizationTransformer(): ShikiTransformer {
  return {
    name: "evml:bracket-colorization",
    tokens(lines) {
      // Nesting depth is shared by all bracket kinds and carries across
      // lines, exactly like Monaco's matcher.
      let depth = 0;

      return lines.map((line) =>
        line.flatMap((token) => {
          if (!BRACKET_RE.test(token.content) || isStringOrComment(token)) {
            return [token];
          }

          const pieces: ThemedToken[] = [];
          let start = 0;
          for (let i = 0; i < token.content.length; i++) {
            const ch = token.content[i];
            if (!BRACKET_RE.test(ch)) continue;

            if (i > start) {
              pieces.push({
                ...token,
                content: token.content.slice(start, i),
                offset: token.offset + start,
              });
            }

            let color: string;
            if (OPEN_BRACKETS.has(ch)) {
              color = BRACKET_COLORS[depth % BRACKET_COLORS.length];
              depth++;
            } else if (depth === 0) {
              color = UNEXPECTED_BRACKET_COLOR;
            } else {
              depth--;
              color = BRACKET_COLORS[depth % BRACKET_COLORS.length];
            }

            pieces.push({
              ...token,
              content: ch,
              offset: token.offset + i,
              color,
              htmlStyle: undefined,
              // Not part of any hover target — drop the scope info so the
              // twoslash transformer never wraps a lone bracket.
              explanation: undefined,
            });
            start = i + 1;
          }

          if (start < token.content.length) {
            pieces.push({
              ...token,
              content: token.content.slice(start),
              offset: token.offset + start,
            });
          }

          return pieces;
        }),
      );
    },
  };
}

import { describe, expect, it } from "bun:test";
import type { LanguageRegistration } from "shiki/core";
import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import solidityGrammar from "shiki/langs/solidity.mjs";
import evmlGrammar from "../../src/grammars/evml.tmLanguage.json";
import { evmlTheme } from "../../src/grammars/evml-theme";
import { evmlHeredocTransformer } from "../../src/viewer/heredocTransformer";

describe("evmlHeredocTransformer", () => {
  it("marks body lines and colors the fences", async () => {
    const highlighter = await createHighlighterCore({
      themes: [evmlTheme],
      langs: [...solidityGrammar, evmlGrammar as LanguageRegistration],
      engine: createOnigurumaEngine(import("shiki/wasm")),
    });
    const html = highlighter.codeToHtml(
      ["set $a <<<SOL", "contract A {}", "SOL", "exec $a"].join("\n"),
      {
        lang: "evml",
        theme: "evml-dark",
        transformers: [evmlHeredocTransformer()],
        includeExplanation: "scopeName",
      },
    );
    const lines = [...html.matchAll(/<span class="([^"]*\bline\b[^"]*)"/g)].map(
      (m) => m[1],
    );
    // Bar + tint on body lines only; fence tokens get the kind color.
    expect(lines).toEqual([
      "line",
      "line heredoc-block heredoc-sol",
      "line",
      "line",
    ]);
    const fences = [
      ...html.matchAll(
        /<span[^>]*class="heredoc-fence heredoc-sol"[^>]*>([^<]*)</g,
      ),
    ].map((m) => m[1].replaceAll("&#x3C;", "<").trim());
    expect(fences).toEqual(["<<<SOL", "SOL"]);
  });
});

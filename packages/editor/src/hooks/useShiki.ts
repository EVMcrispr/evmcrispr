import { useEffect, useState } from "react";
import type { HighlighterCore, LanguageRegistration } from "shiki/core";
import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import solidityGrammar from "shiki/langs/solidity.mjs";
import evmlGrammar from "../grammars/evml.tmLanguage.json";
import { evmlTheme } from "../grammars/evml-theme";

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [evmlTheme],
      // solidity backs the embedded `<<<SOL … SOL` heredoc blocks
      // (source.solidity is included from the evml grammar).
      langs: [...solidityGrammar, evmlGrammar as LanguageRegistration],
      engine: createOnigurumaEngine(import("shiki/wasm")),
    });
  }
  return highlighterPromise;
}

export function useShiki() {
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null);

  useEffect(() => {
    getHighlighter().then(setHighlighter);
  }, []);

  return highlighter;
}

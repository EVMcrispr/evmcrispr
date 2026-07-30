import { useEffect, useState } from "react";
import type { HighlighterCore, LanguageRegistration } from "shiki/core";
import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import jsonGrammar from "shiki/langs/json.mjs";
import solidityGrammar from "shiki/langs/solidity.mjs";
import circomGrammar from "../grammars/circom.tmLanguage.json";
import evmlGrammar from "../grammars/evml.tmLanguage.json";
import { evmlTheme } from "../grammars/evml-theme";

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [evmlTheme],
      // solidity/json/circom back the embedded `<<<SOL`/`<<<JSON`/`<<<CIRCOM`
      // heredoc blocks (source.solidity, source.json and source.circom are
      // included from the evml grammar; circom is our own grammar file).
      langs: [
        ...solidityGrammar,
        ...jsonGrammar,
        circomGrammar as LanguageRegistration,
        evmlGrammar as LanguageRegistration,
      ],
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

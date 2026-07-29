import type { Monaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";

/**
 * Monaco's built-in Solidity tokenizer predates modern Solidity: its
 * keyword list is missing `emit`, `view`, `memory`, `override`, units,
 * and friends, which therefore render as plain identifiers. The Shiki
 * Viewer's TextMate grammar does highlight them, so without this patch
 * the two surfaces disagree inside `<<<SOL` heredocs.
 *
 * Words deliberately NOT added (Shiki leaves them unhighlighted too):
 * receive/fallback declarations, `type`, and builtins like msg/block/tx
 * or keccak256.
 */
const MISSING_SOLIDITY_KEYWORDS = [
  // statements & control
  "emit",
  "delete",
  "assembly",
  "selfdestruct",
  "require",
  "assert",
  "revert",
  "try",
  "catch",
  "finally",
  "global",
  "from",
  "unchecked",
  "error",
  // visibility, mutability and data-location modifiers
  "internal",
  "pure",
  "view",
  "indexed",
  "storage",
  "memory",
  "virtual",
  "calldata",
  "override",
  "abstract",
  "nonpayable",
  "immutable",
  // denomination and time units
  "ether",
  "wei",
  "gwei",
  "finney",
  "szabo",
  "seconds",
  "minutes",
  "hours",
  "days",
  "weeks",
  "years",
];

type AmdRequire = (
  deps: string[],
  onLoad: (mod: {
    language: languages.IMonarchLanguage & { keywords: string[] };
  }) => void,
  onError?: (err: unknown) => void,
) => void;

/**
 * Re-register monaco's "sol" tokenizer with the extended keyword list.
 * Must run before any `<<<SOL` heredoc is tokenized, so the built-in
 * lazy factory never gets a chance to resolve first.
 */
export function patchEmbeddedSolidity(monaco: Monaco): void {
  // The CDN build exposes its AMD loader globally; the solidity module
  // is a lazy chunk we can load eagerly and copy.
  const amdRequire = (globalThis as { require?: unknown }).require;
  if (typeof amdRequire !== "function") return;

  (amdRequire as AmdRequire)(
    ["vs/basic-languages/solidity/solidity"],
    (mod) => {
      monaco.languages.setMonarchTokensProvider("sol", {
        ...mod.language,
        keywords: [...mod.language.keywords, ...MISSING_SOLIDITY_KEYWORDS],
      });
    },
    () => {
      // Not running against the CDN build — keep the stock tokenizer.
    },
  );
}

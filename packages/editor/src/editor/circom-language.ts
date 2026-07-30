import type { Monaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";

/**
 * Minimal circom tokenizer for the `<<<CIRCOM` heredoc (evml.ts embeds it
 * via nextEmbedded). Monaco has no built-in circom language, so this is a
 * hand-written Monarch grammar; its TextMate twin for Shiki rendering
 * lives in ../grammars/circom.tmLanguage.json — keep the two in sync.
 */
const circomLanguage: languages.IMonarchLanguage = {
  defaultToken: "",
  keywords: [
    "pragma",
    "circom",
    "include",
    "template",
    "component",
    "signal",
    "input",
    "output",
    "public",
    "var",
    "function",
    "return",
    "for",
    "while",
    "do",
    "if",
    "else",
    "assert",
    "log",
    "main",
    "parallel",
    "custom",
    "bus",
  ],
  tokenizer: {
    root: [
      { regex: /\/\/.*$/, action: { token: "comment" } },
      { regex: /\/\*/, action: { token: "comment", next: "@comment" } },
      // Signal/constraint operators before generic operators
      // (longest-first: <== ==> <-- --> ===).
      { regex: /<==|==>|<--|-->|===/, action: { token: "operator" } },
      { regex: /"[^"]*"/, action: { token: "string" } },
      { regex: /0x[0-9a-fA-F]+/, action: { token: "number.hex" } },
      { regex: /\d+/, action: { token: "number" } },
      {
        regex: /[$_]*[a-zA-Z][a-zA-Z$_0-9]*/,
        action: {
          cases: {
            "@keywords": { token: "keyword" },
            "@default": { token: "identifier" },
          },
        },
      },
      { regex: /[{}()[\]]/, action: { token: "@brackets" } },
      { regex: /[<>!~?:&|+\-*/^%=]+/, action: { token: "operator" } },
    ],
    comment: [
      { regex: /\*\//, action: { token: "comment", next: "@pop" } },
      { regex: /[^*]+/, action: { token: "comment" } },
      { regex: /\*/, action: { token: "comment" } },
    ],
  },
};

/**
 * Register the circom language. Must run before any `<<<CIRCOM` heredoc is
 * tokenized (same timing rule as patchEmbeddedSolidity).
 */
export function registerCircomLanguage(monaco: Monaco): void {
  monaco.languages.register({ id: "circom" });
  monaco.languages.setMonarchTokensProvider("circom", circomLanguage);
  monaco.languages.setLanguageConfiguration("circom", {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
  });
}

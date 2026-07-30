import type { Monaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";

/**
 * Circom tokenizer for the `<<<CIRCOM` heredoc (evml.ts embeds it via
 * nextEmbedded). Circom's surface syntax is C/JavaScript-flavored (the
 * official iden3 grammar is literally the JS grammar plus three rules),
 * so this follows monaco's JS Monarch conventions with circom's own
 * keywords and constraint operators layered on top. Its TextMate twin for
 * Shiki rendering lives in ../grammars/circom.tmLanguage.json — keep the
 * two in sync.
 */
const circomLanguage: languages.IMonarchLanguage = {
  defaultToken: "",
  keywords: [
    "pragma",
    "circom",
    "custom_templates",
    "include",
    "template",
    "function",
    "component",
    "main",
    "public",
    "signal",
    "input",
    "output",
    "var",
    "if",
    "else",
    "for",
    "while",
    "do",
    "return",
    "assert",
    "log",
    "parallel",
    "custom",
    "bus",
  ],
  tokenizer: {
    root: [
      { regex: /\/\/.*$/, action: { token: "comment" } },
      { regex: /\/\*/, action: { token: "comment", next: "@comment" } },
      // Signal/constraint operators before generic operators
      // (longest-first: <== ==> <-- --> ===). They are the semantic heart
      // of circom, so they render keyword-blue rather than operator-white.
      {
        regex: /<==|==>|<--|-->|===/,
        action: { token: "keyword.operator.constraint" },
      },
      { regex: /"/, action: { token: "string", next: "@string" } },
      { regex: /0x[0-9a-fA-F]+/, action: { token: "number.hex" } },
      { regex: /\d+/, action: { token: "number" } },
      // `template Name` / `function name` — declaration names render
      // function-yellow.
      {
        regex: /\b(template|function)(\s+)([a-zA-Z_$][\w$]*)/,
        action: [{ token: "keyword" }, { token: "" }, { token: "function" }],
      },
      // Capitalized identifiers are template instantiations (Poseidon(2)).
      { regex: /\b_*[A-Z][\w$]*/, action: { token: "type.identifier" } },
      // Call sites: nbits(...), log(...) — but not keywords like if(.
      {
        regex: /[a-z_$][\w$]*(?=\s*\()/,
        action: {
          cases: {
            "@keywords": { token: "keyword" },
            "@default": { token: "function" },
          },
        },
      },
      {
        regex: /[a-zA-Z_$][\w$]*/,
        action: {
          cases: {
            "@keywords": { token: "keyword" },
            "@default": { token: "identifier" },
          },
        },
      },
      { regex: /[{}()[\]]/, action: { token: "@brackets" } },
      { regex: /[<>!~?:&|+\-*/^%=]+/, action: { token: "delimiter" } },
    ],
    comment: [
      { regex: /\*\//, action: { token: "comment", next: "@pop" } },
      { regex: /[^*]+/, action: { token: "comment" } },
      { regex: /\*/, action: { token: "comment" } },
    ],
    string: [
      { regex: /[^\\"]+/, action: { token: "string" } },
      { regex: /\\./, action: { token: "string.escape" } },
      { regex: /"/, action: { token: "string", next: "@pop" } },
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

import type { Monaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";

/**
 * Noir tokenizer for the `<<<NOIR` heredoc (evml.ts embeds it via
 * nextEmbedded). Noir's syntax is deliberately Rust-based, so this follows
 * monaco's built-in Rust Monarch grammar conventions (raw strings via the
 * `$S2` hash trick, `type`/`type.identifier` for types) with the keyword
 * sets of the official noir-lang/vscode-noir grammar. Its TextMate twin
 * for Shiki rendering lives in ../grammars/noir.tmLanguage.json — keep the
 * two in sync.
 */
const noirLanguage: languages.IMonarchLanguage = {
  defaultToken: "",
  keywords: [
    "fn",
    "impl",
    "trait",
    "type",
    "mod",
    "use",
    "struct",
    "enum",
    "match",
    "if",
    "else",
    "for",
    "loop",
    "while",
    "break",
    "continue",
    "global",
    "comptime",
    "quote",
    "unsafe",
    "unconstrained",
    "pub",
    "crate",
    "mut",
    "self",
    "in",
    "as",
    "let",
    "where",
    "super",
    "dep",
    "contract",
  ],
  typeKeywords: ["Field", "field", "bool", "str", "fmtstr"],
  constants: ["true", "false"],
  tokenizer: {
    root: [
      { regex: /\/\/.*$/, action: { token: "comment" } },
      { regex: /\/\*/, action: { token: "comment", next: "@comment" } },
      // Attributes: #[test], #[foreign(sha256)], inner #![...]
      { regex: /#!?\[[^\]]*\]/, action: { token: "annotation" } },
      // Raw strings r"..." / r#"..."# — the hash count travels in the
      // state name and `$S2` matches it on close (monaco rust.ts trick).
      { regex: /r(#*)"/, action: { token: "string", next: "@rawstring.$1" } },
      { regex: /f"/, action: { token: "string", next: "@fstring" } },
      { regex: /"/, action: { token: "string", next: "@string" } },
      { regex: /0x[0-9a-fA-F_]+/, action: { token: "number.hex" } },
      { regex: /\d[\d_]*/, action: { token: "number" } },
      // `fn name` — declaration names render function-yellow.
      {
        regex: /\b(fn)(\s+)([a-zA-Z_]\w*)/,
        action: [{ token: "keyword" }, { token: "" }, { token: "function" }],
      },
      // Sized integer types (u8, u64, i32, ...).
      { regex: /\b[ui]\d+\b/, action: { token: "type" } },
      // Capitalized identifiers are types (structs, traits, generics).
      {
        regex: /\b_*[A-Z]\w*/,
        action: {
          cases: {
            "@typeKeywords": { token: "type" },
            "@default": { token: "type.identifier" },
          },
        },
      },
      // Call sites: assert(...), hash(...) — but not keywords like if(.
      {
        regex: /[a-z_]\w*(?=\s*(?:::<[^>]*>)?\s*\()/,
        action: {
          cases: {
            "@keywords": { token: "keyword" },
            "@default": { token: "function" },
          },
        },
      },
      {
        regex: /[a-zA-Z_]\w*/,
        action: {
          cases: {
            "@keywords": { token: "keyword" },
            "@typeKeywords": { token: "type" },
            "@constants": { token: "constant" },
            "@default": { token: "identifier" },
          },
        },
      },
      { regex: /[{}()[\]]/, action: { token: "@brackets" } },
      { regex: /->|=>|::/, action: { token: "delimiter" } },
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
    // f"sum is {a}" — interpolations render as plain identifiers inside
    // the string, mirroring variable.other.interpolation.noir in Shiki.
    fstring: [
      { regex: /\\.|\{\{|\}\}/, action: { token: "string.escape" } },
      { regex: /\{[^"{}]*\}/, action: { token: "identifier" } },
      { regex: /[^\\"{}]+|[{}]/, action: { token: "string" } },
      { regex: /"/, action: { token: "string", next: "@pop" } },
    ],
    rawstring: [
      { regex: /[^"#]+/, action: { token: "string" } },
      {
        regex: /"(#*)/,
        action: {
          cases: {
            "$1==$S2": { token: "string", next: "@pop" },
            "@default": { token: "string" },
          },
        },
      },
      { regex: /["#]/, action: { token: "string" } },
    ],
  },
};

/**
 * Register the Noir language. Must run before any `<<<NOIR` heredoc is
 * tokenized (same timing rule as patchEmbeddedSolidity).
 */
export function registerNoirLanguage(monaco: Monaco): void {
  monaco.languages.register({ id: "noir" });
  monaco.languages.setMonarchTokensProvider("noir", noirLanguage);
  monaco.languages.setLanguageConfiguration("noir", {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
  });
}

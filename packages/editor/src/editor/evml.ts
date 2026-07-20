import type { languages } from "monaco-editor";

const bounded = (text: string) => `\\b${text}\\b`;

const identifierStart = "[a-zA-Z]";
const identifierContinue = "[\\-:a-zA-Z0-9]";
const identifier = bounded(`${identifierStart}${identifierContinue}*`);

const namedLiterals = ["true", "false"];

const nonCommentWs = `[ \\t\\r\\n]`;

const numericLiteral = `0x([0-9a-fA-F]+)|([0-9]+(e[0-9]+)?(s|mo|h|d|w|m|y)?(/(s|mo|h|d|w|m|y))?)`;

export const conf: languages.LanguageConfiguration = {
  brackets: [
    ["{", "}"] as languages.CharacterPair,
    ["[", "]"] as languages.CharacterPair,
    ["(", ")"] as languages.CharacterPair,
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "'", close: "'" },
    { open: "'''", close: "'''" },
    { open: '"', close: '"' },
    { open: '"""', close: '"""' },
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "'", close: "'", notIn: ["string", "comment"] },
    { open: "'", close: "'", notIn: ["string", "comment"] },
    { open: "'''", close: "'''", notIn: ["string", "comment"] },
    { open: '"', close: '"', notIn: ["string", "comment"] },
    { open: '"""', close: '"""', notIn: ["string", "comment"] },
  ],
  autoCloseBefore: ":.,=}])' \n\t",
  indentationRules: {
    increaseIndentPattern: new RegExp(
      "^((?!\\/\\/).)*(\\{[^}\"'`]*|\\([^)\"'`]*|\\[[^\\]\"'`]*)$",
    ),
    decreaseIndentPattern: new RegExp("^((?!.*?\\/\\*).*\\*/)?\\s*[\\}\\]].*$"),
  },
  wordPattern: /(-?\d*\.\d\w*)|([^`~!#%^&*()=+[{\]}\\|;'",<>/?\s]+)/g,
};

export const createLanguage: (
  commands: string[],
  helpers: string[],
) => languages.IMonarchLanguage = (commands, helpers) => ({
  defaultToken: "",
  tokenPostfix: ".evml",

  brackets: [
    { open: "{", close: "}", token: "delimiter.curly" },
    { open: "[", close: "]", token: "delimiter.square" },
    { open: "(", close: ")", token: "delimiter.parenthesis" },
  ],

  commands: [...commands, "as"],

  helpers: [...helpers],

  namedLiterals,

  escapes: `\\\\(u{[0-9A-Fa-f]+}|n|r|t|\\\\|')`,

  tokenizer: {
    root: [{ include: "@expression" }, { include: "@whitespace" }],

    stringSingle: [
      { regex: `[^\\\\']+`, action: { token: "string" } },
      { regex: "@escapes", action: { token: "string.escape" } },
      { regex: `\\\\.`, action: { token: "string.escape.invalid" } },
      { regex: `'`, action: { token: "string", next: "@pop" } },
    ],

    stringDouble: [
      { regex: `[^\\\\"]+`, action: { token: "string" } },
      { regex: "@escapes", action: { token: "string.escape" } },
      { regex: `\\\\.`, action: { token: "string.escape.invalid" } },
      { regex: `"`, action: { token: "string", next: "@pop" } },
    ],

    comment: [],

    whitespace: [
      { regex: nonCommentWs },
      { regex: `#.*$`, action: { token: "comment" } },
    ],

    // <<<SOL / <<<JSON heredocs embed monaco's built-in tokenizers (the CDN
    // `min/vs` build lazy-loads them as language ids "sol" and "json").
    // Other sentinels tokenize as a plain string; Monarch parametrized
    // states ($S2 holds the sentinel) match the closing line.
    solHeredoc: [
      {
        regex: /^SOL\b/,
        action: {
          token: "string.heredoc.delimiter",
          next: "@pop",
          nextEmbedded: "@pop",
        },
      },
    ],

    jsonHeredoc: [
      {
        regex: /^JSON\b/,
        action: {
          token: "string.heredoc.delimiter",
          next: "@pop",
          nextEmbedded: "@pop",
        },
      },
    ],

    heredoc: [
      {
        regex: /^([A-Z][A-Z0-9]*)\b/,
        action: {
          cases: {
            "$1==$S2": {
              token: "string.heredoc.delimiter",
              next: "@pop",
            },
            "@default": { token: "string" },
          },
        },
      },
      { regex: /.+/, action: { token: "string" } },
    ],

    expression: [
      {
        regex: /<<<SOL\b[ \t]*$/,
        action: {
          token: "string.heredoc.delimiter",
          next: "@solHeredoc",
          nextEmbedded: "sol",
        },
      },
      {
        regex: /<<<JSON\b[ \t]*$/,
        action: {
          token: "string.heredoc.delimiter",
          next: "@jsonHeredoc",
          nextEmbedded: "json",
        },
      },
      {
        regex: /<<<([A-Z][A-Z0-9]*)\b/,
        action: {
          token: "string.heredoc.delimiter",
          next: "@heredoc.$1",
        },
      },
      {
        regex: `'`,
        action: { token: "string", next: "@stringSingle" },
      },
      {
        regex: `"`,
        action: { token: "string", next: "@stringDouble" },
      },

      { regex: bounded(numericLiteral), action: { token: "number" } },
      {
        regex: identifier,
        action: {
          cases: {
            "@commands": { token: "command" },
            "@namedLiterals": { token: "literal" },
            "@default": { token: "identifier" },
          },
        },
      },
      {
        regex: /@[a-zA-Z0-9._\-]+/,
        action: {
          cases: {
            "@helpers": { token: "helper" },
          },
        },
      },
      {
        regex: /\$[a-zA-Z0-9]+/,
        action: {
          token: "variable",
        },
      },
      {
        regex: /#\d+/,
        action: { token: "number" },
      },
    ],
  },
});

export const contribution = {
  id: "evml",
  extensions: [".evml"],
  aliases: [],
};

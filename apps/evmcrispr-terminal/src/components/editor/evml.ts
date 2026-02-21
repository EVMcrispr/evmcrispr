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

  escapes: `\\\\(u{[0-9A-Fa-f]+}|n|r|t|\\\\|'|\\\${)`,

  tokenizer: {
    root: [{ include: "@expression" }, { include: "@whitespace" }],

    stringLiteral: [
      {
        regex: `\\\${`,
        action: { token: "delimiter.bracket", next: "@bracketCounting" },
      },
      { regex: `[^\\\\'"$]+`, action: { token: "string" } },
      { regex: "@escapes", action: { token: "string.escape" } },
      { regex: `\\\\.`, action: { token: "string.escape.invalid" } },
      { regex: `'`, action: { token: "string", next: "@pop" } },
      { regex: `"`, action: { token: "string", next: "@pop" } },
    ],

    bracketCounting: [
      {
        regex: `{`,
        action: { token: "delimiter.bracket", next: "@bracketCounting" },
      },
      { regex: `}`, action: { token: "delimiter.bracket", next: "@pop" } },
      { include: "expression" },
    ],

    comment: [],

    whitespace: [
      { regex: nonCommentWs },
      { regex: `#.*$`, action: { token: "comment" } },
    ],

    expression: [
      {
        regex: `'`,
        action: { token: "string.literal", next: "@stringLiteral" },
      },
      {
        regex: `"`,
        action: { token: "string.literal", next: "@stringLiteral" },
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
        regex: /@[a-zA-Z.]+/,
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
    ],
  },
});

export const contribution = {
  id: "evml",
  extensions: [".evml"],
  aliases: [],
};

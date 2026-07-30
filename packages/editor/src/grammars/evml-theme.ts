import type { ThemeRegistrationRaw } from "shiki/core";

/**
 * Custom Shiki theme matching the Monaco editor colors used in the
 * EVMcrispr terminal.
 *
 * Monaco's theme (editor/theme.ts) inherits vs-dark, so every token the
 * custom rules don't override falls back to vs-dark's palette. The rules
 * below replicate that combined result — when touching colors here, keep
 * editor/theme.ts + monaco's vs-dark in mind as the source of truth.
 */
export const evmlTheme: ThemeRegistrationRaw = {
  name: "evml-dark",
  type: "dark",
  settings: [
    {
      settings: {
        foreground: "#ffffff",
        background: "#000000",
      },
    },
    // ── EVML (custom monaco rules) ──────────────────────────────
    {
      scope: ["comment"],
      settings: { foreground: "#9933cc" },
    },
    {
      scope: ["keyword.control.evml", "keyword.control.module-command.evml"],
      settings: { foreground: "#0FFF50" },
    },
    {
      scope: ["entity.name.function.helper.evml"],
      settings: { foreground: "#cccc00" },
    },
    {
      scope: ["variable.other.evml"],
      settings: { foreground: "#72bcd4" },
    },
    // `name:` of a named argument / record entry — soft teal, colon white.
    {
      scope: ["variable.parameter.evml"],
      settings: { foreground: "#5BB498" },
    },
    {
      scope: ["string"],
      settings: { foreground: "#fd6600" },
    },
    {
      scope: ["constant.language.boolean.evml"],
      settings: { foreground: "#4169E1" },
    },
    // EVML operators and `--flags` are tokenized on both surfaces but
    // deliberately rendered default white (see editor/theme.ts).
    {
      scope: [
        "keyword.operator.namespace.evml",
        "keyword.operator.error-capture-optional.evml",
        "keyword.operator.error-capture.evml",
        "keyword.operator.arrow.evml",
        "entity.name.tag.option.evml",
      ],
      settings: { foreground: "#ffffff" },
    },
    // Monaco matches `string.heredoc.delimiter` against its `string`
    // rule, so heredoc fences are string-orange.
    {
      scope: ["punctuation.definition.heredoc"],
      settings: { foreground: "#fd6600" },
    },
    // ── vs-dark fallbacks shared by EVML + embedded langs ───────
    {
      scope: ["constant.numeric"],
      settings: { foreground: "#B5CEA8" },
    },
    // ── Embedded Solidity (<<<SOL) — monaco's "sol" tokenizer ───
    // Monaco lumps types/modifiers/control-flow into one keyword
    // bucket (vs-dark blue); identifiers and declared names stay
    // default white, so entity.name.* has no rule here on purpose.
    {
      scope: [
        "keyword",
        "storage.type",
        "storage.modifier",
        "support.type",
        "constant.language",
        "variable.language.this",
        "variable.language.super",
        "entity.name.tag.pragma",
      ],
      settings: { foreground: "#569CD6" },
    },
    // `pragma solidity ^0.8.0` — monaco renders the version as numbers.
    {
      scope: ["constant.other.pragma"],
      settings: { foreground: "#B5CEA8" },
    },
    // Monaco's comment state swallows natspec/TODO tags whole, so keep
    // them comment-purple instead of letting keyword/storage rules win.
    {
      scope: [
        "keyword.comment.todo",
        "storage.type.author.natspec",
        "storage.type.dev.natspec",
        "storage.type.title.natspec",
        "storage.type.param.natspec",
        "storage.type.return.natspec",
      ],
      settings: { foreground: "#9933cc" },
    },
    // Solidity operators — monaco's "sol" tokenizer emits `delimiter`.
    {
      scope: ["keyword.operator"],
      settings: { foreground: "#DCDCDC" },
    },
    {
      scope: ["constant.numeric.hexadecimal"],
      settings: { foreground: "#5BB498" },
    },
    // vs-dark `delimiter` — punctuation monaco tokenizes explicitly.
    // String quotes are deliberately absent: monaco includes them in
    // the string/key token.
    {
      scope: [
        "punctuation.terminator",
        "punctuation.brace",
        "punctuation.parameters",
        "punctuation.accessor",
        "punctuation.definition.dictionary",
        "punctuation.definition.array",
        "punctuation.separator",
      ],
      settings: { foreground: "#DCDCDC" },
    },
    // ── Embedded JSON (<<<JSON) — monaco's json tokenizer ───────
    {
      scope: ["support.type.property-name.json"],
      settings: { foreground: "#9CDCFE" },
    },
    {
      scope: ["string.quoted.double.json"],
      settings: { foreground: "#CE9178" },
    },
    // true/false/null → monaco `keyword.json`
    {
      scope: ["constant.language.json"],
      settings: { foreground: "#CE9178" },
    },
  ],
};

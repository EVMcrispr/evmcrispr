import type { editor } from "monaco-editor";

export const theme = {
  base: "vs-dark" as editor.BuiltinTheme,
  inherit: true,
  rules: [
    {
      background: "000000",
      token: "",
    },
    {
      foreground: "9933cc",
      token: "comment",
    },
    {
      foreground: "0FFF50",
      token: "command",
    },
    {
      foreground: "cccc00",
      token: "helper",
    },
    {
      foreground: "72bcd4",
      token: "variable",
    },
    {
      foreground: "fd6600",
      token: "string.literal",
    },
    {
      foreground: "fd6600",
      token: "string",
    },
    {
      foreground: "4169E1",
      token: "literal",
    },
    // Operators (`::`, `->`, `=>`, `-!>`, `$>`) and `--flags` are
    // tokenized but deliberately kept default white — mirrored by the
    // Shiki viewer theme (grammars/evml-theme.ts).
    {
      foreground: "ffffff",
      token: "operator",
    },
    {
      foreground: "ffffff",
      token: "option",
    },
    // `name:` of a named argument / record entry — mirrored by
    // `variable.parameter.evml` in grammars/evml-theme.ts.
    {
      foreground: "5BB498",
      token: "namedArg",
    },
  ],
  colors: {
    "editor.foreground": "#FFFFFF",
    "editor.background": "#000000",
    "editor.selectionBackground": "#35493CE0",
    "editor.lineHighlightBackground": "#333333",
    "editorCursor.foreground": "#FFFFFF",
    "editorWhitespace.foreground": "#404040",
    "editorGutter.background": "#000000",

    // Hover widget palette — kept in sync with the viewer's
    // `.evml-hover-popover` so the cards look identical on both
    // surfaces. Layout/typography tweaks Monaco's theme can't reach
    // (border weight, padding, fonts, scrollbars) live in `index.css`
    // under `.monaco-editor .monaco-hover`.
    "editorHoverWidget.background": "#000000",
    "editorHoverWidget.foreground": "#F5F5F5",
    "editorHoverWidget.border": "#8CF467", // evm-green-300
    "editorHoverWidget.statusBarBackground": "#121212", // evm-gray-900
    "textLink.foreground": "#8CF467",
    "textLink.activeForeground": "#4BEE11", // evm-green-500
    "textCodeBlock.background": "#F5F5F51A", // foreground @ 10% opacity
  },
};

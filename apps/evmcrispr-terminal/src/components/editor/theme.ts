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
  ],
  colors: {
    "editor.foreground": "#FFFFFF",
    "editor.background": "#000000",
    "editor.selectionBackground": "#35493CE0",
    "editor.lineHighlightBackground": "#333333",
    "editorCursor.foreground": "#FFFFFF",
    "editorWhitespace.foreground": "#404040",
    "editorGutter.background": "#1a1a1a",
  },
};

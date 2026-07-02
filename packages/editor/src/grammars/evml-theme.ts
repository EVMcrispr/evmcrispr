import type { ThemeRegistrationRaw } from "shiki/core";

/**
 * Custom Shiki theme matching the Monaco editor colors
 * used in the EVMcrispr terminal.
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
    {
      scope: ["comment"],
      settings: { foreground: "#9933cc" },
    },
    {
      scope: ["keyword.control", "keyword.control.module-command"],
      settings: { foreground: "#0FFF50" },
    },
    {
      scope: ["entity.name.function.helper"],
      settings: { foreground: "#cccc00" },
    },
    {
      scope: ["variable.other"],
      settings: { foreground: "#72bcd4" },
    },
    {
      scope: ["string", "string.quoted"],
      settings: { foreground: "#fd6600" },
    },
    {
      scope: ["constant.language.boolean"],
      settings: { foreground: "#4169E1" },
    },
    {
      scope: ["constant.numeric"],
      settings: { foreground: "#4169E1" },
    },
    {
      scope: ["keyword.operator"],
      settings: { foreground: "#ffffff" },
    },
    {
      scope: ["entity.name.tag.option"],
      settings: { foreground: "#72bcd4" },
    },
    {
      scope: ["constant.character.escape"],
      settings: { foreground: "#72bcd4" },
    },
  ],
};

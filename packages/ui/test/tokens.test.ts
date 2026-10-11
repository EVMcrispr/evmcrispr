import { expect, test } from "bun:test";
import path from "node:path";

const STYLES = path.resolve(import.meta.dir, "../../editor/src/styles");
const tokens = await Bun.file(path.join(STYLES, "tokens.css")).text();
const theme = await Bun.file(path.join(STYLES, "theme.css")).text();

const names = [...tokens.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]);
const declared = new Set(names);

test("every variable the theme maps is declared in tokens.css", () => {
  const inline = theme.slice(theme.indexOf("@theme inline"));
  const used = [...inline.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
  expect(used.length).toBeGreaterThan(20);
  expect(used.filter((name) => !declared.has(name))).toEqual([]);
});

test("every status has a colour, a surface and a line", () => {
  for (const status of ["success", "warning", "danger", "info", "unverified"])
    for (const part of ["", "-surface", "-line"])
      expect(declared.has(`--${status}${part}`)).toBe(true);
});

test("the tokens are declared once", async () => {
  expect(names.length).toBe(declared.size);
  for (const file of [
    "../../editor/src/styles/components.css",
    "../../editor/src/styles/embed.css",
    "../src/styles/theme.css",
  ]) {
    const text = await Bun.file(path.resolve(import.meta.dir, file)).text();
    expect(text).not.toMatch(/^\s*--background\s*:/m);
  }
});

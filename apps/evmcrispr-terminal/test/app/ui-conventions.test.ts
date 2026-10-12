import { expect, test } from "bun:test";
import path from "node:path";
import { Glob } from "bun";

const SRC = path.resolve(import.meta.dir, "../../src");

// Every component of the app.
async function sources() {
  const files: { file: string; source: string }[] = [];
  // Other brands' marks, drawn in their own colours.
  for await (const file of new Glob("**/*.tsx").scan(SRC))
    if (!file.startsWith("components/icons/"))
      files.push({ file, source: await Bun.file(path.join(SRC, file)).text() });
  return files.sort((a, b) => a.file.localeCompare(b.file));
}

/** Every `file:line  match` of a pattern, for a failure that says where. */
async function found(pattern: RegExp) {
  const hits: string[] = [];
  for (const { file, source } of await sources())
    source.split("\n").forEach((line, index) => {
      // A comment may name what the code must not use.
      if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line)) return;
      const match = line.match(pattern);
      if (match) hits.push(`${file}:${index + 1}  ${match[0]}`);
    });
  return hits;
}

test("the app's components are there to be checked", async () => {
  expect((await sources()).length).toBeGreaterThan(80);
});

// App code chooses layout; looks come from @repo/ui. A colour is one of
// the tokens of theme.css, by its meaning: never a palette colour, a hex,
// or a semantic colour thinned with an opacity step.
test("colours are tokens: no palette, no hex, no opacity step", async () => {
  expect(
    await found(
      /\b(?:text|bg|border(?:-[trblxy])?|ring|outline|fill|stroke|decoration|from|via|to|shadow|divide|placeholder|caret|accent)-(?:evm-[a-z]+-\d+|(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d+|white\b|black\b)/,
    ),
  ).toEqual([]);
  expect(
    await found(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?=[\]"'`;,)])|\brgba?\(/),
  ).toEqual([]);
  expect(
    await found(
      /\b(?:foreground|background|primary|secondary|card|muted|accent|destructive|fg|line|edge|heading|success|warning|danger|info|unverified)(?:-[a-z]+)*\/\d/,
    ),
  ).toEqual([]);
});

test("type sizes are the four of the scale", async () => {
  expect(
    await found(/\btext-(?:\[[^\]]+\]|xs|sm|base|lg|xl|[2-9]xl)\b/),
  ).toEqual([]);
});

test("controls and overlays are the shared ones, not raw elements", async () => {
  expect(await found(/<(?:button|input|textarea|select|dialog)\b/)).toEqual([]);
});

test("icons come from @repo/ui/icons", async () => {
  expect(await found(/from "(?:@heroicons\/react[^"]*|lucide-react)"/)).toEqual(
    [],
  );
});

/** The opening tag starting at `source[start]` (a `<`), braces and all. */
function openingTag(source: string, start: number) {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === "{") depth++;
    else if (char === "}") depth--;
    else if (char === ">" && depth === 0 && source[i - 1] !== "=")
      return source.slice(start, i + 1);
  }
  return source.slice(start);
}

// A shared component already has its shadow, font, corners and touch
// size. Setting them again at a call site is how the app ended up with a
// second theme written in overrides.
test("a shared component's look is not overridden where it is used", async () => {
  const hits: string[] = [];
  for (const { file, source } of await sources()) {
    const shared = new Set(
      [...source.matchAll(/import \{([^}]+)\} from "@repo\/ui";/g)].flatMap(
        ([, names]) =>
          names
            .split(",")
            .map(
              (name) =>
                name
                  .trim()
                  .split(/\s+as\s+/)
                  .at(-1) ?? "",
            )
            .filter((name) => /^[A-Z]/.test(name)),
      ),
    );
    for (const match of source.matchAll(/<([A-Z]\w*)(?:\.\w+)?[\s>]/g)) {
      if (!shared.has(match[1])) continue;
      const tag = openingTag(source, match.index);
      const classes = tag.match(/className=(?:"([^"]*)"|\{[^}]*\})/)?.[0] ?? "";
      const override = classes.match(
        /\b(?:shadow(?:-\w+)?|font-(?:head|sans|mono)|rounded(?:-[\w()-]+)?|min-h-[1-9]\d*|min-w-[1-9]\d*)\b/,
      );
      if (override)
        hits.push(
          `${file}:${source.slice(0, match.index).split("\n").length}  <${match[1]}> ${override[0]}`,
        );
    }
  }
  expect(hits).toEqual([]);
});

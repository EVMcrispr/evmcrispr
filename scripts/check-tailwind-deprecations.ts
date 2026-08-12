#!/usr/bin/env bun
/**
 * Flag Tailwind utility class names that were renamed in v4.
 *
 * Why this exists: `@tailwindcss/upgrade` is a one-shot codemod with no
 * check mode — it rewrites files, bumps dependency ranges and reformats
 * CSS quotes, so it cannot run in a hook. And the renamed utilities are
 * invisible to the compiler: `bg-gradient-to-t` and friends still emit
 * CSS as deprecated aliases, so a build never fails on them. Only a
 * name-based check catches the drift.
 *
 * Usage:
 *   bun scripts/check-tailwind-deprecations.ts [files...]
 * With no arguments, scans the app/package sources. Never modifies files;
 * exits 1 when a renamed utility is found.
 *
 * Deliberately NOT flagged: utilities that still exist but changed
 * meaning between v3 and v4 (`shadow-sm` is now v3's `shadow`,
 * `rounded-sm` is now v3's `rounded`, `blur-sm`, `ring`) and
 * `outline-none` (v3's behaviour is now `outline-hidden`). Those are
 * valid in new v4 code, so flagging them would fire on correct code.
 * They are listed under NOTICES and only reported, never fatal.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

interface Rule {
  /** Matches the base utility, after variants and `!` have been stripped. */
  test: RegExp;
  replacement: string;
  /** Only meaningful inside a class attribute, where a bare `!x` is a class. */
  attributeOnly?: boolean;
}

/**
 * Strip variant prefixes (`focus:`, `md:`, `data-[state=open]:`, stacked)
 * to get the base utility. Colons inside `[...]` are part of an arbitrary
 * value (`bg-[url(https://…)]`) and must not be treated as separators.
 */
function baseUtility(token: string): { base: string; prefix: string } {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) cut = i;
  }
  return { prefix: token.slice(0, cut + 1), base: token.slice(cut + 1) };
}

const RENAMED: Rule[] = [
  {
    test: /^bg-gradient-to-(t|tr|r|br|b|bl|l|tl)$/,
    replacement: "bg-linear-to-$1",
  },
  { test: /^flex-shrink(-.+)?$/, replacement: "shrink$1" },
  { test: /^flex-grow(-.+)?$/, replacement: "grow$1" },
  { test: /^overflow-ellipsis$/, replacement: "text-ellipsis" },
  { test: /^decoration-(slice|clone)$/, replacement: "box-decoration-$1" },
  { test: /^break-words$/, replacement: "wrap-break-word" },
  {
    test: /^(bg|text|border|ring|placeholder|divide)-opacity-\d+$/,
    replacement:
      "the opacity modifier, e.g. bg-black/50 (this one emits no CSS at all)",
  },
  {
    test: /^!(.+)$/,
    replacement: "$1! (v4 moved the important modifier to a suffix)",
    attributeOnly: true,
  },
];

/** Reported but never fatal — see the header comment. */
const NOTICES: Rule[] = [
  {
    test: /^outline-none$/,
    replacement: "outline-hidden, if you want v3's forced-colors fallback",
  },
];

const SOURCE_ROOTS = ["apps", "packages"];
const EXTENSIONS = new Set([".tsx", ".jsx", ".ts", ".astro", ".css"]);

/** class="…" / className="…" / className={…"…"…} */
const CLASS_ATTR =
  /(?:className|class)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/gs;
const STRING_LITERAL = /"([^"]*)"|'([^']*)'|`([^`]*)`/gs;
const INTERPOLATION = /\$\{[^}]*\}/g;
/** @apply in stylesheets takes bare utility names. */
const APPLY_AT_RULE = /@apply\s+([^;{}]+)/g;

/**
 * Two passes, because class lists live in two kinds of place.
 *
 * `attribute` — inside `class=`/`className=`, where every token is a class,
 * so even a bare `!p-2` is unambiguous.
 * `loose` — every other string literal, which catches `cva()`/`cn()` variant
 * tables declared away from any JSX. Only distinctive names are matched
 * there, so ordinary prose strings can't trip it.
 */
function classStrings(
  source: string,
  isCss: boolean,
): { attribute: string[]; loose: string[] } {
  if (isCss) {
    const applied = [...source.matchAll(APPLY_AT_RULE)].map(([, list]) => list);
    return { attribute: applied, loose: [] };
  }

  const attribute: string[] = [];
  for (const [, dq, sq, braced] of source.matchAll(CLASS_ATTR)) {
    if (dq !== undefined || sq !== undefined) {
      attribute.push(dq ?? sq ?? "");
      continue;
    }
    for (const match of (braced ?? "").matchAll(STRING_LITERAL)) {
      const literal = match[1] ?? match[2] ?? match[3];
      if (literal !== undefined) attribute.push(literal);
    }
  }

  const loose: string[] = [];
  for (const match of source.matchAll(STRING_LITERAL)) {
    const literal = match[1] ?? match[2] ?? match[3];
    if (literal !== undefined) loose.push(literal);
  }
  return { attribute, loose };
}

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith("."))
      continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (EXTENSIONS.has(extname(path))) yield path;
  }
}

interface Finding {
  file: string;
  line: number;
  token: string;
  replacement: string;
}

function check(files: string[]): { errors: Finding[]; notices: Finding[] } {
  const errors: Finding[] = [];
  const notices: Finding[] = [];

  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const isCss = extname(file) === ".css";
    const lines = source.split("\n");
    const { attribute, loose } = classStrings(source, isCss);
    const seen = new Set<string>();

    for (const [chunks, inAttribute] of [
      [attribute, true],
      [loose, false],
    ] as const) {
      for (const chunk of chunks) {
        for (const token of chunk.replace(INTERPOLATION, " ").split(/\s+/)) {
          if (!token) continue;
          const { base, prefix } = baseUtility(token);
          for (const [rules, bucket] of [
            [RENAMED, errors],
            [NOTICES, notices],
          ] as const) {
            for (const rule of rules) {
              if (rule.attributeOnly && !inAttribute) continue;
              if (!rule.test.test(base)) continue;
              const line = lines.findIndex((l) => l.includes(token)) + 1;
              const key = `${file}:${line}:${token}`;
              if (seen.has(key)) continue;
              seen.add(key);
              bucket.push({
                file,
                line: line || 1,
                token,
                replacement: prefix + base.replace(rule.test, rule.replacement),
              });
            }
          }
        }
      }
    }
  }
  return { errors, notices };
}

const args = process.argv.slice(2);
const files = args.length
  ? args.filter((f) => EXTENSIONS.has(extname(f)))
  : SOURCE_ROOTS.flatMap((root) => [...walk(root)]);

const { errors, notices } = check(files);

for (const f of notices) {
  console.log(
    `notice ${f.file}:${f.line}  ${f.token} → consider ${f.replacement}`,
  );
}
for (const f of errors) {
  console.error(`error  ${f.file}:${f.line}  ${f.token} → ${f.replacement}`);
}

if (errors.length) {
  console.error(
    `\n${errors.length} renamed Tailwind utility/utilities found in ${files.length} file(s).`,
  );
  process.exit(1);
}

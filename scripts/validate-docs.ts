#!/usr/bin/env bun
/**
 * Validate every ```evml code block in the documentation.
 *
 * Runs the real parser + static semantic analysis (offline, no RPC) over:
 *   - modules/<mod>/src/{commands,helpers}/*.md
 *   - modules/<mod>/README.md
 *   - apps/evmcrispr-website/src/content/docs/ (guides; reference symlinks
 *     are skipped since their sources are already covered)
 *   - README.md
 *
 * Rules:
 *   - Blocks under a `## Syntax` heading are skipped (pseudo-syntax with
 *     placeholders, not runnable EVML).
 *   - A fence tagged ```evml novalidate is skipped (for intentionally
 *     partial or intentionally wrong snippets).
 *   - Blocks in module docs get an implicit `load <module>` preamble,
 *     mirroring how docCases run in tests.
 *
 * Exits non-zero if any block produces an error-severity diagnostic.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Docs are always generated in full, so experimental modules/commands/
// helpers must validate too. Set before the core/sdk imports below read it.
process.env.VITE_PUBLIC_EXPERIMENTAL = "true";

import { createEvml } from "../packages/core/src";

const ROOT = resolve(import.meta.dirname, "..");

const moduleNames = readdirSync(join(ROOT, "modules")).filter(
  (dir) =>
    dir !== "std" && existsSync(join(ROOT, "modules", dir, "src/index.ts")),
);

const evml = createEvml().use(
  ...moduleNames.map((name) => ({
    name,
    load: () => import(join(ROOT, "modules", name, "src/index.ts")),
  })),
);

// ── Collect doc files ────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) continue; // reference symlinks → already covered
    if (stat.isDirectory()) walk(full, out);
    else if (entry.endsWith(".md") || entry.endsWith(".mdx")) out.push(full);
  }
  return out;
}

const files: string[] = [];
const modulesDir = join(ROOT, "modules");
for (const mod of readdirSync(modulesDir)) {
  const modDir = join(modulesDir, mod);
  if (!lstatSync(modDir).isDirectory()) continue;
  for (const p of [
    join(modDir, "README.md"),
    ...walk(join(modDir, "src/commands")),
    ...walk(join(modDir, "src/helpers")),
  ]) {
    if (existsSync(p)) files.push(p);
  }
}
files.push(...walk(join(ROOT, "apps/evmcrispr-website/src/content/docs")));
if (existsSync(join(ROOT, "README.md"))) files.push(join(ROOT, "README.md"));

// ── Extract ```evml blocks ───────────────────────────────────────────

interface Block {
  file: string;
  /** 1-indexed line of the first line of code inside the fence. */
  line: number;
  code: string;
  skip: boolean;
}

function extractBlocks(file: string): Block[] {
  const lines = readFileSync(file, "utf-8").split("\n");
  const blocks: Block[] = [];
  let inFence = false;
  let fenceIsEvml = false;
  let fenceSkip = false;
  let fenceStart = 0;
  let buf: string[] = [];
  let inSyntaxSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inFence && /^#{2,3}\s/.test(line)) {
      inSyntaxSection = /^#{2,3}\s+Syntax\b/.test(line);
    }
    const fenceMatch = line.match(/^```(\S*)\s*(.*)$/);
    if (fenceMatch && !inFence) {
      inFence = true;
      fenceIsEvml = fenceMatch[1] === "evml";
      fenceSkip = inSyntaxSection || /\bnovalidate\b/.test(fenceMatch[2] ?? "");
      fenceStart = i + 2;
      buf = [];
      continue;
    }
    if (inFence) {
      if (line.startsWith("```")) {
        if (fenceIsEvml) {
          blocks.push({
            file,
            line: fenceStart,
            code: buf.join("\n"),
            skip: fenceSkip,
          });
        }
        inFence = false;
        continue;
      }
      buf.push(line);
    }
  }
  return blocks;
}

/** Module a doc file belongs to, or null. */
function moduleOf(file: string): string | null {
  const rel = relative(ROOT, file);
  const m = rel.match(/^modules\/([^/]+)\//);
  return m ? m[1] : null;
}

// ── Validate ─────────────────────────────────────────────────────────

let checked = 0;
let skipped = 0;
let failures = 0;

for (const file of files) {
  for (const block of extractBlocks(file)) {
    if (block.skip || !block.code.trim()) {
      skipped++;
      continue;
    }
    const mod = moduleOf(file);
    const needsLoad =
      mod !== null &&
      mod !== "std" &&
      !new RegExp(`^\\s*load\\s+${mod}\\b`, "m").test(block.code);
    const preamble = needsLoad ? `load ${mod}\n` : "";
    const preambleLines = needsLoad ? 1 : 0;

    checked++;
    const { diagnostics } = await evml.script(preamble + block.code).validate();
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      failures++;
      const rel = relative(ROOT, block.file);
      console.log(`\n✗ ${rel}:${block.line}`);
      for (const e of errors) {
        const line = block.line + (e.line - 1 - preambleLines);
        console.log(`  L${line}: ${e.message}`);
      }
      console.log(
        block.code
          .split("\n")
          .map((l) => `  | ${l}`)
          .join("\n"),
      );
    }
  }
}

// ── Validate relative .md links ──────────────────────────────────────
// Relative links are kept repo-browsable and rewritten to page URLs by the
// website build, so every one of them must resolve to a real file on disk.

const LINK_RE = /\]\(([^)#\s]+\.md)(#[^)]*)?\)/g;
let linksChecked = 0;
let brokenLinks = 0;

for (const file of files) {
  const content = readFileSync(file, "utf-8");
  for (const m of content.matchAll(LINK_RE)) {
    const url = m[1];
    if (/^([a-z]+:|\/)/i.test(url)) continue;
    linksChecked++;
    const target = resolve(join(file, ".."), url);
    if (!existsSync(target)) {
      brokenLinks++;
      const line = content.slice(0, m.index).split("\n").length;
      console.log(`\n✗ ${relative(ROOT, file)}:${line} broken link: ${url}`);
    }
  }
}

// ── Lint helper/command descriptions ─────────────────────────────────
// A `description` says what the item means, in one sentence, for both of a
// helper's faces. It is not the place to re-teach the `!` convention (the
// EVML guide does that once), to name Operators internals, or to spell out
// how a face compiles — that belongs to the `## On-chain face` section of
// the item's `.md`. A user-visible `!`-only difference goes in
// `compileDescription`, which reaches the `@name!` spelling alone.

interface DescRule {
  test: RegExp;
  /** Which fields the rule applies to. */
  fields: ("description" | "compileDescription" | "arg")[];
  message: string;
}

const OPERATOR_INTERNALS =
  /\b(foldWords|foldBytes|foldRange|filterWords|mapWords|zipWords|unzipWords|sortWords|uniqueWords|iotaWords|wordIndexOf|sumWords|hashPairSorted|byteLen|bitSet|rawCall|arrayWordsParam|Operators\.\w+)\b/;

const DESC_RULES: DescRule[] = [
  {
    test: /\bAs\s+`?@[\w.:]+!/i,
    fields: ["description"],
    message:
      "drop the `As @name! …` clause: put a user-visible on-chain difference in `compileDescription`, and the compilation detail in the doc's `## On-chain face` section",
  },
  {
    test: /\bat (assertion|composition) time\b/i,
    fields: ["description", "compileDescription", "arg"],
    message:
      "`@name!` evaluating on-chain at assertion time is the `!` convention itself, documented once in the EVML guide",
  },
  {
    test: OPERATOR_INTERNALS,
    fields: ["description", "compileDescription", "arg"],
    message:
      "name the behaviour, not the Operators function that implements it (that belongs in the doc's `## On-chain face` section)",
  },
  {
    test: /\b(words payload|lambda template|core pick|typed nav)\b/i,
    fields: ["description", "compileDescription", "arg"],
    message:
      "compiler vocabulary belongs in the doc's `## On-chain face` section, not in a hover tooltip",
  },
  {
    test: /\(\s*in\s+@[\w.:]+!/i,
    fields: ["arg"],
    message:
      "drop the `(in @name! …)` parenthetical: the argument shapes an on-chain face accepts belong in the doc's `## On-chain face` section",
  },
];

/** Read a string-literal property, honouring quote style and escapes. */
function readStringProp(text: string, key: string): string | null {
  const match = new RegExp(`\\b${key}\\s*:\\s*`).exec(text);
  if (!match) return null;
  let i = match.index + match[0].length;
  while (i < text.length && /\s/.test(text[i])) i++;
  const quote = text[i];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  i++;
  let out = "";
  while (i < text.length && text[i] !== quote) {
    if (text[i] === "\\") {
      out += text[i + 1] ?? "";
      i += 2;
      continue;
    }
    out += text[i];
    i++;
  }
  return i >= text.length ? null : out.replace(/\s+/g, " ").trim();
}

/** Bracket-balanced content of `args: [ … ]`, starting the search at `from`. */
function readArgsBlock(text: string, from: number): string | null {
  const start = text.slice(from).search(/\bargs\s*:\s*\[/);
  if (start === -1) return null;
  const open = text.indexOf("[", from + start);
  let depth = 1;
  let i = open + 1;
  while (i < text.length && depth > 0) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") depth--;
    i++;
  }
  return depth === 0 ? text.slice(open + 1, i - 1) : null;
}

const DESC_MAX = 200;
const COMPILE_DESC_MAX = 160;

let descsChecked = 0;
let descProblems = 0;

function reportDesc(where: string, field: string, value: string, why: string) {
  descProblems++;
  console.log(`\n✗ ${where} (${field}): ${why}`);
  console.log(`  | ${value}`);
}

for (const modName of readdirSync(join(ROOT, "modules"))) {
  for (const kind of ["helpers", "commands"] as const) {
    const dir = join(ROOT, "modules", modName, "src", kind);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".ts") || entry.startsWith("_")) continue;
      const file = join(dir, entry);
      const raw = readFileSync(file, "utf-8");
      const defineIdx = raw.search(/\bdefine\w*(Helper|Command)\s*[<(]/);
      if (defineIdx === -1) continue;
      const content = raw.slice(defineIdx);
      const argsBlock = readArgsBlock(content, 0);
      const topLevel = argsBlock ? content.replace(argsBlock, "") : content;
      const where = `${relative(ROOT, file)}`;

      const fields: [DescRule["fields"][number], string][] = [];
      const desc = readStringProp(topLevel, "description");
      if (desc) fields.push(["description", desc]);
      const compileDesc = readStringProp(topLevel, "compileDescription");
      if (compileDesc) fields.push(["compileDescription", compileDesc]);
      if (argsBlock) {
        for (const obj of argsBlock.matchAll(/\{([^}]+)\}/g)) {
          const argDesc = readStringProp(obj[1], "description");
          if (argDesc) fields.push(["arg", argDesc]);
        }
      }

      for (const [field, value] of fields) {
        descsChecked++;
        for (const rule of DESC_RULES) {
          if (rule.fields.includes(field) && rule.test.test(value)) {
            reportDesc(where, field, value, rule.message);
          }
        }
      }

      // Length: only bounded where the over-explanation grows, so a rich
      // off-chain description (the circom and noir helpers) stays free.
      const hasCompile = /(?<!\.)\bcompile\s*[:(]/.test(topLevel);
      if (hasCompile && desc && desc.length > DESC_MAX) {
        reportDesc(
          where,
          "description",
          desc,
          `${desc.length} chars, over the ${DESC_MAX}-char budget for a two-faced helper`,
        );
      }
      if (compileDesc && compileDesc.length > COMPILE_DESC_MAX) {
        reportDesc(
          where,
          "compileDescription",
          compileDesc,
          `${compileDesc.length} chars, over the ${COMPILE_DESC_MAX}-char budget (it is one sentence)`,
        );
      }
      if (compileDesc && !hasCompile) {
        reportDesc(
          where,
          "compileDescription",
          compileDesc,
          "declared on an item with no `compile` face, so nothing ever shows it",
        );
      }
    }
  }
}

console.log(
  `\nvalidate-docs: ${checked} blocks checked, ${skipped} skipped, ${failures} with errors; ` +
    `${linksChecked} relative links checked, ${brokenLinks} broken; ` +
    `${descsChecked} descriptions checked, ${descProblems} with problems`,
);
if (failures > 0 || brokenLinks > 0 || descProblems > 0) process.exit(1);

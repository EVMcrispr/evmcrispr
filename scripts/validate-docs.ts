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

import { createEvml } from "../packages/core/src";

const ROOT = resolve(import.meta.dirname, "..");

const evml = createEvml().use(
  { name: "aragonos", load: () => import("../modules/aragonos/src") },
  { name: "sim", load: () => import("../modules/sim/src") },
  { name: "giveth", load: () => import("../modules/giveth/src") },
  { name: "ens", load: () => import("../modules/ens/src") },
  { name: "token", load: () => import("../modules/token/src") },
  {
    name: "access-control",
    load: () => import("../modules/access-control/src"),
  },
  { name: "governor", load: () => import("../modules/governor/src") },
  { name: "proxies", load: () => import("../modules/proxies/src") },
  { name: "http", load: () => import("../modules/http/src") },
  { name: "safe", load: () => import("../modules/safe/src") },
  { name: "swaps", load: () => import("../modules/swaps/src") },
  { name: "bridges", load: () => import("../modules/bridges/src") },
  { name: "lang", load: () => import("../modules/lang/src") },
  { name: "assertions", load: () => import("../modules/assertions/src") },
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

console.log(
  `\nvalidate-docs: ${checked} blocks checked, ${skipped} skipped, ${failures} with errors`,
);
if (failures > 0) process.exit(1);

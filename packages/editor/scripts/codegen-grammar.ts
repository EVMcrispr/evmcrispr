#!/usr/bin/env bun
/**
 * Regenerates the static command-keyword list in the TextMate grammar
 * (src/grammars/evml.tmLanguage.json) from the std module's command files,
 * so the Shiki surfaces can't drift from the registry-driven Monaco
 * highlighting when std commands are added, renamed, or removed.
 *
 * Rewrites only the `command` repository entry via targeted replacement,
 * keeping the rest of the file (and its biome formatting) untouched.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const editorRoot = join(import.meta.dir, "..");
const stdCommandsDir = join(
  editorRoot,
  "..",
  "..",
  "modules",
  "std",
  "src",
  "commands",
);
const grammarPath = join(editorRoot, "src", "grammars", "evml.tmLanguage.json");

if (!existsSync(stdCommandsDir)) {
  console.error(
    `codegen-grammar: std commands dir not found: ${stdCommandsDir}`,
  );
  process.exit(1);
}

const commandNames = readdirSync(stdCommandsDir)
  .filter((f) => f.endsWith(".ts") && !f.startsWith("_"))
  .map((f) => f.replace(/\.ts$/, ""))
  .sort();

if (commandNames.length === 0) {
  console.error(
    "codegen-grammar: no std commands found — refusing to blank the grammar",
  );
  process.exit(1);
}

const raw = readFileSync(grammarPath, "utf-8");
const commandBlockRe = /"command": \{[^{}]*\}/;
if (!commandBlockRe.test(raw)) {
  console.error(
    `codegen-grammar: no "command" repository entry found in ${grammarPath}`,
  );
  process.exit(1);
}

const match = `\\b(?:${commandNames.join("|")})\\b`;
const block = [
  '"command": {',
  '      "comment": "Auto-generated from modules/std/src/commands by scripts/codegen-grammar.ts — do not edit by hand.",',
  `      "match": ${JSON.stringify(match)},`,
  '      "name": "keyword.control.evml"',
  "    }",
].join("\n");

const updated = raw.replace(commandBlockRe, block);

// Only write on change to avoid needless turbo watch cascades.
if (updated !== raw) {
  writeFileSync(grammarPath, updated);
  console.log(`codegen-grammar: wrote ${grammarPath}`);
} else {
  console.log(`codegen-grammar: ${grammarPath} up to date`);
}

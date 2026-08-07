#!/usr/bin/env bun
/**
 * Code-generation script for EVMcrispr modules.
 *
 * Scans `src/commands/` and `src/helpers/` in the current working directory
 * and generates `src/_generated.ts` with typed, static import maps.
 *
 * Usage: bun codegen.ts [srcDir]
 *   srcDir defaults to ./src
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const srcDir = process.argv[2] || "./src";
const commandsDir = join(srcDir, "commands");
const helpersDir = join(srcDir, "helpers");

function getNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.startsWith("_"))
    .map((f) => f.replace(/\.ts$/, ""))
    .sort();
}

interface ArgDefMeta {
  name: string;
  type: string | string[];
  optional?: boolean;
  rest?: boolean;
  namedOnly?: boolean;
  description?: string;
}

interface HelperMeta {
  /** The declared `name:` — the registration key. May differ from the
   *  filename (e.g. `balance.ts` declaring `name: "balance!"`). */
  name: string | null;
  returnType: string | string[] | null;
  hasArgs: boolean;
  argDefs: ArgDefMeta[];
  description: string | null;
  experimental: boolean;
}

/** Parse a type value from source: either `"string"` or `["string", "array"]`. */
function parseTypeValue(text: string, prop: string): string | string[] | null {
  const singleRe = new RegExp(`${prop}:\\s*["']([^"']+)["']`);
  const singleMatch = text.match(singleRe);
  if (singleMatch) return singleMatch[1];

  const arrayRe = new RegExp(`${prop}:\\s*\\[([^\\]]+)\\]`);
  const arrayMatch = text.match(arrayRe);
  if (arrayMatch) {
    return arrayMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return null;
}

/** Extract the bracket-balanced content of `<prop>: [ ... ]` from source text. */
function extractArrayBlock(content: string, prop: string): string | null {
  const start = content.search(new RegExp(`${prop}:\\s*\\[`));
  if (start === -1) return null;
  const openIdx = content.indexOf("[", start);
  let depth = 1;
  let i = openIdx + 1;
  while (i < content.length && depth > 0) {
    if (content[i] === "[") depth++;
    else if (content[i] === "]") depth--;
    i++;
  }
  if (depth !== 0) return null;
  return content.slice(openIdx + 1, i - 1);
}

function extractArgsBlock(content: string): string | null {
  return extractArrayBlock(content, "args");
}

/** Whether the config object has a top-level `experimental: true`, ignoring
 *  occurrences inside the `args`/`opts` arrays (an experimental *option* must
 *  not mark the whole command experimental). */
function hasTopLevelExperimental(content: string): boolean {
  let stripped = content;
  for (const prop of ["args", "opts"]) {
    const block = extractArrayBlock(stripped, prop);
    if (block) stripped = stripped.replace(block, "");
  }
  return /\bexperimental:\s*true/.test(stripped);
}

function extractArgDefs(content: string): ArgDefMeta[] {
  const argsContent = extractArgsBlock(content);
  if (!argsContent?.trim()) return [];

  const result: ArgDefMeta[] = [];
  const objRegex = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = objRegex.exec(argsContent)) !== null) {
    const obj = m[1];
    const nameMatch = obj.match(/name:\s*["']([^"']+)["']/);
    const typeVal = parseTypeValue(obj, "type");
    if (!nameMatch || !typeVal) continue;

    const arg: ArgDefMeta = { name: nameMatch[1], type: typeVal };
    if (/optional:\s*true/.test(obj)) arg.optional = true;
    if (/rest:\s*true/.test(obj)) arg.rest = true;
    if (/namedOnly:\s*true/.test(obj)) arg.namedOnly = true;
    const descMatch = obj.match(/description:\s*["']([^"']+)["']/);
    if (descMatch) arg.description = descMatch[1];
    result.push(arg);
  }

  return result;
}

function extractHelperMeta(dir: string, name: string): HelperMeta {
  const filePath = join(dir, `${name}.ts`);
  if (!existsSync(filePath))
    return {
      name: null,
      returnType: null,
      hasArgs: false,
      argDefs: [],
      description: null,
      experimental: false,
    };
  const content = readFileSync(filePath, "utf-8");
  const returnType = parseTypeValue(content, "returnType");
  const descMatch = content.match(/description:\s*["']([^"']+)["']/);
  const argDefs = extractArgDefs(content);
  const hasArgs = argDefs.length > 0;
  // The declared name, ignoring `name:` occurrences inside the args array.
  const argsBlock = extractArgsBlock(content);
  const topLevel = argsBlock ? content.replace(argsBlock, "") : content;
  const nameMatch = topLevel.match(/name:\s*["']([^"']+)["']/);
  return {
    name: nameMatch?.[1] ?? null,
    returnType,
    hasArgs,
    argDefs,
    description: descMatch?.[1] ?? null,
    experimental: hasTopLevelExperimental(content),
  };
}

function extractCommandMeta(
  dir: string,
  name: string,
): { description: string | null; experimental: boolean } {
  const filePath = join(dir, `${name}.ts`);
  if (!existsSync(filePath)) return { description: null, experimental: false };
  const content = readFileSync(filePath, "utf-8");
  const descMatch = content.match(/description:\s*["']([^"']+)["']/);
  return {
    description: descMatch?.[1] ?? null,
    experimental: hasTopLevelExperimental(content),
  };
}

const commandNames = getNames(commandsDir);
const helperNames = getNames(helpersDir);
const hasConfigs = existsSync(join(srcDir, "configs.ts"));

const lines: string[] = [
  "// WARNING: this file is auto-generated by codegen. Do not edit.",
];

const imports: string[] = [];
if (commandNames.length > 0) imports.push("CommandImportMap");
if (helperNames.length > 0) imports.push("HelperImportMap");

if (imports.length > 0) {
  lines.push(`import type { ${imports.join(", ")} } from "@evmcrispr/sdk";`);
}

lines.push("");

if (commandNames.length > 0) {
  lines.push("export const commands: CommandImportMap = {");
  for (const name of commandNames) {
    const meta = extractCommandMeta(commandsDir, name);
    const parts: string[] = [`load: () => import("./commands/${name}")`];
    if (meta.description)
      parts.push(`description: ${JSON.stringify(meta.description)}`);
    if (meta.experimental) parts.push("experimental: true");
    lines.push(`  ${JSON.stringify(name)}: { ${parts.join(", ")} },`);
  }
  lines.push("};");
} else {
  lines.push("export const commands = {};");
}

lines.push("");

if (helperNames.length > 0) {
  lines.push("export const helpers: HelperImportMap = {");
  for (const name of helperNames) {
    const meta = extractHelperMeta(helpersDir, name);
    const parts: string[] = [];
    if (meta.returnType)
      parts.push(`returnType: ${JSON.stringify(meta.returnType)}`);
    parts.push(`hasArgs: ${meta.hasArgs}`);
    if (meta.argDefs.length > 0) {
      const defsStr = meta.argDefs
        .map((a) => {
          const props: string[] = [
            `name: ${JSON.stringify(a.name)}`,
            `type: ${JSON.stringify(a.type)}`,
          ];
          if (a.optional) props.push("optional: true");
          if (a.rest) props.push("rest: true");
          if (a.namedOnly) props.push("namedOnly: true");
          if (a.description)
            props.push(`description: ${JSON.stringify(a.description)}`);
          return `{ ${props.join(", ")} }`;
        })
        .join(", ");
      parts.push(`argDefs: [${defsStr}]`);
    }
    if (meta.description)
      parts.push(`description: ${JSON.stringify(meta.description)}`);
    if (meta.experimental) parts.push("experimental: true");
    // Register under the declared name (which may carry a trailing `!`);
    // the import path always uses the filename.
    const key = meta.name ?? name;
    lines.push(
      `  ${JSON.stringify(key)}: { load: () => import("./helpers/${name}"), ${parts.join(", ")} },`,
    );
  }
  lines.push("};");
} else {
  lines.push("export const helpers = {};");
}

lines.push("");

if (hasConfigs) {
  lines.push('export { configs } from "./configs";');
} else {
  // Untyped on purpose: packages without configs may not depend on the sdk.
  lines.push("export const configs = [];");
}

lines.push("");

// Module-level experimental flag, read from the module's package.json.
let moduleExperimental = false;
const pkgPath = join(srcDir, "..", "package.json");
if (existsSync(pkgPath)) {
  try {
    moduleExperimental =
      JSON.parse(readFileSync(pkgPath, "utf-8")).experimental === true;
  } catch {
    /* unreadable package.json — treat as stable */
  }
}
lines.push(`export const experimental = ${moduleExperimental};`);

lines.push(""); // trailing newline

const outPath = join(srcDir, "_generated.ts");
const content = lines.join("\n");

// Only write if content actually changed to avoid unnecessary filesystem events
// that trigger turbo watch / bun build --watch cascades.
if (!existsSync(outPath) || readFileSync(outPath, "utf-8") !== content) {
  writeFileSync(outPath, content);
  console.log(`codegen: wrote ${outPath}`);
} else {
  console.log(`codegen: ${outPath} up to date`);
}

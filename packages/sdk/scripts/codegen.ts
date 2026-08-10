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
  /** The declared `name:` — the base registration key. May differ from
   *  the filename. NEVER ends in `!`: the on-chain face of a helper is
   *  registered as `"name!"` automatically when a `compile` face is
   *  detected. */
  name: string | null;
  returnType: string | string[] | null;
  hasArgs: boolean;
  argDefs: ArgDefMeta[];
  description: string | null;
  /** Appended to `description` on the `"name!"` entry only. */
  compileDescription: string | null;
  experimental: boolean;
  /** Whether the config declares a `run` (off-chain) face. */
  hasRun: boolean;
  /** Whether the config declares a `compile` (on-chain) face. */
  hasCompile: boolean;
  /** Whether the config declares `batchable: false` (recorded as registry
   *  metadata so the analyzer needs no dynamic import). */
  batchableFalse: boolean;
}

/**
 * Read a string-literal property out of source text, honouring the quote
 * style and escapes. A naive `["']([^"']+)["']` regex stops at the first
 * apostrophe or nested quote, which silently truncated descriptions in the
 * generated registry while the docs (which scan properly) showed them whole.
 * Template literals are read too, so a description may contain either quote.
 */
function extractStringProp(text: string, prop: string): string | null {
  const match = new RegExp(`\\b${prop}\\s*:\\s*`).exec(text);
  if (!match) return null;
  let i = match.index + match[0].length;
  while (i < text.length && /\s/.test(text[i])) i++;
  const quote = text[i];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  i++;
  let result = "";
  while (i < text.length && text[i] !== quote) {
    if (text[i] === "\\") {
      const escaped = text[i + 1];
      result +=
        escaped === "n" ? "\n" : escaped === "t" ? "\t" : (escaped ?? "");
      i += 2;
      continue;
    }
    result += text[i];
    i++;
  }
  if (i >= text.length) return null;
  // Prettier wraps long literals across lines; collapse to one line so the
  // registry carries the same single-paragraph string the docs render.
  return result.replace(/\s+/g, " ").trim();
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
    const argDesc = extractStringProp(obj, "description");
    if (argDesc) arg.description = argDesc;
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
      compileDescription: null,
      experimental: false,
      hasRun: true,
      hasCompile: false,
      batchableFalse: false,
    };
  const raw = readFileSync(filePath, "utf-8");
  // Anchor extraction at the define call: `name:`/`description:` matches
  // above it belong to unrelated constants (e.g. a `{ name: "Ether" }`
  // native-currency fallback) and must not become the registration key.
  const defineIdx = raw.search(/\bdefine\w*Helper\s*[<(]/);
  const content = defineIdx === -1 ? raw : raw.slice(defineIdx);
  const returnType = parseTypeValue(content, "returnType");
  const description = extractStringProp(content, "description");
  const argDefs = extractArgDefs(content);
  const hasArgs = argDefs.length > 0;
  // The declared name and face detection, ignoring the args array (arg
  // names and descriptions must not shadow the config's own fields).
  const argsBlock = extractArgsBlock(content);
  const topLevel = argsBlock ? content.replace(argsBlock, "") : content;
  const nameMatch = topLevel.match(/name:\s*["']([^"']+)["']/);
  // `(?<!\.)` keeps method calls in face bodies (e.g. `client.run(...)`)
  // from registering as face declarations.
  const hasRun = /(?<!\.)\brun\s*[:(]/.test(topLevel);
  const hasCompile = /(?<!\.)\bcompile\s*[:(]/.test(topLevel);
  return {
    name: nameMatch?.[1] ?? null,
    returnType,
    hasArgs,
    argDefs,
    description,
    compileDescription: extractStringProp(topLevel, "compileDescription"),
    experimental: hasTopLevelExperimental(content),
    hasRun,
    hasCompile,
    batchableFalse: /\bbatchable:\s*false/.test(topLevel),
  };
}

function extractCommandMeta(
  dir: string,
  name: string,
): { description: string | null; experimental: boolean } {
  const filePath = join(dir, `${name}.ts`);
  if (!existsSync(filePath)) return { description: null, experimental: false };
  const raw = readFileSync(filePath, "utf-8");
  // Same anchoring as extractHelperMeta: skip constants above the define.
  const defineIdx = raw.search(/\bdefine\w*Command\s*[<(]/);
  const content = defineIdx === -1 ? raw : raw.slice(defineIdx);
  return {
    description: extractStringProp(content, "description"),
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
    if (meta.experimental) parts.push("experimental: true");
    // One helper file emits up to two registry keys sharing one loader:
    // `"name"` for the off-chain `run` face and `"name!"` for the
    // on-chain `compile` face. The declared name itself never carries
    // the `!` — that suffix is the on-chain-face addressing convention.
    //
    // The two keys share one `description` (what the helper means) and the
    // `!` key alone appends `compileDescription`, so hovering `@name` never
    // shows on-chain-only caveats and hovering `@name!` shows exactly the
    // ones that apply.
    const descProp = (extra?: string | null): string[] => {
      if (!meta.description) return [];
      const text = extra ? `${meta.description} ${extra}` : meta.description;
      return [`description: ${JSON.stringify(text)}`];
    };
    const key = meta.name ?? name;
    if (key.endsWith("!")) {
      console.error(
        `codegen: helper ${name}.ts declares name ${JSON.stringify(key)} — ` +
          "helper names never include the trailing `!`; declare the bare " +
          "name and put the on-chain body in the `compile` face instead",
      );
      process.exit(1);
    }
    const load = `load: () => import("./helpers/${name}")`;
    if (meta.hasRun || !meta.hasCompile) {
      const runParts = [...parts, ...descProp()];
      if (meta.batchableFalse) runParts.push("batchable: false");
      lines.push(
        `  ${JSON.stringify(key)}: { ${load}, ${runParts.join(", ")} },`,
      );
    }
    if (meta.hasCompile) {
      const compileParts = [...parts, ...descProp(meta.compileDescription)];
      lines.push(
        `  ${JSON.stringify(`${key}!`)}: { ${load}, ${compileParts.join(", ")}, onchain: true },`,
      );
    }
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

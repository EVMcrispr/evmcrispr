#!/usr/bin/env bun
/**
 * Documentation generator for EVMcrispr.
 *
 * Reads metadata directly from defineCommand/defineHelper source files
 * and produces Markdown reference docs co-located with the source:
 *   modules/<mod>/src/commands/<name>.md
 *   modules/<mod>/src/helpers/<name>.md
 *   modules/<mod>/README.md   (module index)
 *
 * Hand-written content below a <!-- HAND-WRITTEN --> marker is preserved
 * on regeneration.
 *
 * Also generates:
 *   llms-full.txt  — all reference docs concatenated
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sortModuleNames } from "../packages/modules/src/order";
import {
  EXPERIMENTAL_BADGE,
  EXPERIMENTAL_MARKER,
  transformExperimentalMd,
} from "../packages/sdk/src/utils/experimental";

const ROOT = resolve(import.meta.dirname, "..");

/** Whether experimental items are included in the env-dependent build
 *  artifacts (website reference tree, llms-full.txt). The committed
 *  in-tree markdown is always generated in full. */
const EXPERIMENTAL_ON =
  process.env.VITE_PUBLIC_EXPERIMENTAL === "true" ||
  process.env.VITE_PUBLIC_EXPERIMENTAL === "1";

// ── Module registry ──────────────────────────────────────────────────

interface ModuleInfo {
  name: string;
  prefix: string; // e.g. "aragonos:" or "" for std
  dir: string; // absolute path to modules/<mod>
  overview: string;
  experimental: boolean;
}

/** Face detection reads the source text, so a commented-out face would
 *  register a helper that does not exist: `@abi.encodePacked` carries a
 *  `// compile: ...` design note and was published as having an on-chain
 *  face, appearing in completions and docs and then failing at dispatch.
 *  Only whole-line comments and block comments are removed, so a `//`
 *  inside a string literal is left alone. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function discoverModules(): ModuleInfo[] {
  const modulesRoot = join(ROOT, "modules");
  const names = readdirSync(modulesRoot).filter((dir) =>
    existsSync(join(modulesRoot, dir, "package.json")),
  );
  return sortModuleNames(names).map((name) => {
    const pkg = JSON.parse(
      readFileSync(join(modulesRoot, name, "package.json"), "utf-8"),
    );
    return {
      name,
      prefix: name === "std" ? "" : `${name}:`,
      dir: join(modulesRoot, name),
      overview: pkg.description ?? "",
      experimental: pkg.experimental === true,
    };
  });
}

const MODULES = discoverModules();

// ── Types ────────────────────────────────────────────────────────────

interface ArgDef {
  name: string;
  type: string | string[];
  optional?: boolean;
  rest?: boolean;
  namedOnly?: boolean;
  description?: string;
}

interface OptDef {
  name: string;
  type: string;
  description?: string;
  experimental?: boolean;
}

interface CommandMeta {
  name: string;
  description: string;
  argDefs: ArgDef[];
  optDefs: OptDef[];
  experimental: boolean;
}

interface HelperMeta {
  /** Filename-derived name — determines doc file paths. */
  name: string;
  /** The declared `name:` — may differ from the filename (e.g.
   *  `balance.ts` declaring `name: "balance!"`). Used for display. */
  declaredName: string;
  description: string;
  /** On-chain-face-only note, rendered under the description as a labelled
   *  line on the `@name!` spelling. */
  compileDescription: string;
  returnType: string | string[];
  hasArgs: boolean;
  argDefs: ArgDef[];
  experimental: boolean;
}

// ── Parse metadata directly from source .ts files ────────────────────

function getNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.startsWith("_"))
    .map((f) => f.replace(/\.ts$/, ""))
    .sort();
}

function parseModuleSource(modDir: string): {
  commands: CommandMeta[];
  helpers: HelperMeta[];
} {
  const commandsDir = join(modDir, "src/commands");
  const helpersDir = join(modDir, "src/helpers");

  const commands = getNames(commandsDir).map((name) =>
    extractCommandMeta(modDir, name),
  );
  const helpers = getNames(helpersDir).map((name) =>
    extractHelperMeta(modDir, name),
  );

  return { commands, helpers };
}

function extractCommandMeta(modDir: string, name: string): CommandMeta {
  const filePath = join(modDir, "src/commands", `${name}.ts`);
  const content = readFileSync(filePath, "utf-8");
  return {
    name,
    description: extractStringProp(content, "description") ?? "",
    argDefs: extractArgs(content),
    optDefs: extractOpts(content, modDir, filePath),
    experimental: hasTopLevelExperimental(content),
  };
}

function extractHelperMeta(modDir: string, name: string): HelperMeta {
  const filePath = join(modDir, "src/helpers", `${name}.ts`);
  const content = readFileSync(filePath, "utf-8");
  const returnType = parseTypeValue(content, "returnType") ?? "any";
  const argDefs = extractArgs(content);
  // The declared registration name, ignoring `name:` keys inside args.
  const defMatch = content.match(/defineHelper/);
  let declaredName = name;
  if (defMatch) {
    const configStart = content.indexOf("{", defMatch.index!);
    let stripped = content;
    const block = extractArrayBlock(stripped, configStart, "args");
    if (block) stripped = stripped.replace(block, "");
    declaredName = extractStringProp(stripped, "name") ?? name;
    // A compile-only helper has no off-chain surface: its page carries the
    // `!` face name (`@min!`). Two-faced helpers keep the bare name and
    // document the `!` face in an "On-chain face" section.
    const faces = stripComments(stripped);
    const hasRun = /(?<!\.)\brun\s*[:(]/.test(faces);
    const hasCompile = /(?<!\.)\bcompile\s*[:(]/.test(faces);
    if (hasCompile && !hasRun) declaredName += "!";
  }
  return {
    name,
    declaredName,
    description: extractStringProp(content, "description") ?? "",
    compileDescription: extractStringProp(content, "compileDescription") ?? "",
    returnType,
    hasArgs: argDefs.length > 0,
    argDefs,
    experimental: hasTopLevelExperimental(content),
  };
}

/** Whether the config object has a top-level `experimental: true`, ignoring
 *  occurrences inside the `args`/`opts` arrays (an experimental *option* must
 *  not mark the whole command experimental). */
function hasTopLevelExperimental(content: string): boolean {
  const defMatch = content.match(
    /(?:defineCommand|define\w*Helper)\s*(?:<[^>]+>)?\s*\(\s*\{/,
  );
  if (!defMatch) return false;
  const configStart = content.indexOf(
    "{",
    defMatch.index! + defMatch[0].length - 1,
  );
  let stripped = content;
  for (const key of ["args", "opts"]) {
    const block = extractArrayBlock(stripped, configStart, key);
    if (block) stripped = stripped.replace(block, "");
  }
  return /\bexperimental:\s*true/.test(stripped);
}

/** Parse a type value: either `"string"` or `["string", "array"]`. */
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

/** Extract args from a defineCommand/defineHelper call. */
function extractArgs(content: string): ArgDef[] {
  const defMatch = content.match(
    /(?:defineCommand|define\w*Helper)\s*(?:<[^>]+>)?\s*\(\s*\{/,
  );
  if (!defMatch) return [];
  const configStart = content.indexOf(
    "{",
    defMatch.index! + defMatch[0].length - 1,
  );
  const argsBlock = extractArrayBlock(content, configStart, "args");
  if (!argsBlock) return [];
  return parseArgObjects(argsBlock);
}

/** Extract opts from a defineCommand call. */
function extractOpts(
  content: string,
  modDir: string,
  filePath: string,
): OptDef[] {
  const defMatch = content.match(
    /(?:defineCommand|define\w*Helper)\s*(?:<[^>]+>)?\s*\(\s*\{/,
  );
  if (!defMatch) return [];
  const configStart = content.indexOf(
    "{",
    defMatch.index! + defMatch[0].length - 1,
  );
  const optsBlock = extractArrayBlock(content, configStart, "opts");
  if (!optsBlock) return [];

  const opts: OptDef[] = [];
  const objRe = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(optsBlock)) !== null) {
    const nameMatch = m[1].match(/name:\s*(?:"([^"]+)"|([A-Za-z_]\w*))/);
    const typeMatch = m[1].match(/type:\s*"([^"]+)"/);
    if (nameMatch && typeMatch) {
      let optName = nameMatch[1] ?? nameMatch[2];
      if (!nameMatch[1] && optName) {
        optName = resolveConstant(content, modDir, optName, filePath);
      }
      opts.push({
        name: optName,
        type: typeMatch[1],
        description: extractStringProp(m[1], "description") ?? undefined,
        experimental: /\bexperimental:\s*true/.test(m[1]) || undefined,
      });
    }
  }
  return opts;
}

/** Find `key: [...]` within the config object starting at configStart. */
function extractArrayBlock(
  content: string,
  configStart: number,
  key: string,
): string | null {
  const keyRe = new RegExp(`${key}:\\s*\\[`);
  const keyMatch = keyRe.exec(content.slice(configStart));
  if (!keyMatch) return null;
  const bracketStart = configStart + keyMatch.index + keyMatch[0].length - 1;
  let depth = 1;
  let i = bracketStart + 1;
  while (i < content.length && depth > 0) {
    if (content[i] === "[") depth++;
    else if (content[i] === "]") depth--;
    i++;
  }
  return content.slice(bracketStart + 1, i - 1);
}

function parseArgObjects(block: string): ArgDef[] {
  const args: ArgDef[] = [];
  let i = 0;
  while (i < block.length) {
    const objStart = block.indexOf("{", i);
    if (objStart === -1) break;
    let depth = 1;
    let j = objStart + 1;
    while (j < block.length && depth > 0) {
      if (block[j] === "{") depth++;
      else if (block[j] === "}") depth--;
      j++;
    }
    const objContent = block.slice(objStart + 1, j - 1);
    const nameMatch = objContent.match(/name:\s*"([^"]+)"/);
    const typeValue = parseTypeValue(objContent, "type");
    if (nameMatch && typeValue) {
      const arg: ArgDef = { name: nameMatch[1], type: typeValue };
      if (/optional:\s*true/.test(objContent)) arg.optional = true;
      if (/rest:\s*true/.test(objContent)) arg.rest = true;
      if (/namedOnly:\s*true/.test(objContent)) arg.namedOnly = true;
      const description = extractStringProp(objContent, "description");
      if (description !== null) arg.description = description;
      args.push(arg);
    }
    i = j;
  }
  return args;
}

/** Resolve a constant like DAO_OPT_NAME to its string value. */
function resolveConstant(
  fileContent: string,
  modDir: string,
  constName: string,
  filePath?: string,
): string {
  const localRe = new RegExp(
    `(?:const|let|var)\\s+${constName}\\s*=\\s*"([^"]+)"`,
  );
  const localMatch = fileContent.match(localRe);
  if (localMatch) return localMatch[1];

  const importRe = new RegExp(
    `import\\s*\\{[^}]*\\b${constName}\\b[^}]*\\}\\s*from\\s*"([^"]+)"`,
  );
  const importMatch = fileContent.match(importRe);
  if (importMatch) {
    const { dirname } = require("node:path");
    const fileDir = filePath ? dirname(filePath) : join(modDir, "src");
    const candidates = [
      resolve(fileDir, `${importMatch[1]}.ts`),
      resolve(fileDir, importMatch[1], "index.ts"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        const imported = readFileSync(candidate, "utf-8");
        const defMatch = imported.match(
          new RegExp(
            `(?:export\\s+)?(?:const|let|var)\\s+${constName}\\s*=\\s*"([^"]+)"`,
          ),
        );
        if (defMatch) return defMatch[1];
      }
    }
  }
  return constName;
}

// ── Doc examples extraction from test files ─────────────────────────

interface DocCase {
  description: string;
  code: string;
}

function extractDocCases(
  modDir: string,
  kind: "commands" | "helpers",
  name: string,
  identifier: string,
): DocCase[] {
  const candidates = [
    join(modDir, "test/integration", kind, `${name}.test.ts`),
  ];
  const dotIdx = name.indexOf(".");
  if (dotIdx !== -1) {
    candidates.push(
      join(
        modDir,
        "test/integration",
        kind,
        `${name.slice(0, dotIdx)}.test.ts`,
      ),
    );
  }

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf-8");

    const fnName = kind === "helpers" ? "describeHelper" : "describeCommand";
    const searchExpr = kind === "helpers" ? `@${identifier}` : identifier;
    const callRe = new RegExp(
      `${fnName}\\s*\\(\\s*["'\`]${escapeRegExp(searchExpr)}["'\`]`,
    );
    const callMatch = callRe.exec(content);
    if (!callMatch) continue;

    const pos = callMatch.index + callMatch[0].length;
    const commaIdx = content.indexOf(",", pos);
    if (commaIdx === -1) continue;
    const configStart = content.indexOf("{", commaIdx);
    if (configStart === -1) continue;
    const configEnd = findClosingBracketStrAware(content, configStart);
    if (configEnd === -1) continue;
    const configContent = content.slice(configStart, configEnd + 1);

    const docCasesRe = /docCases\s*:\s*\[/;
    const docMatch = docCasesRe.exec(configContent);
    if (!docMatch) continue;
    const arrayStart = configContent.indexOf("[", docMatch.index);
    const arrayEnd = findClosingBracketStrAware(configContent, arrayStart);
    if (arrayEnd === -1) continue;
    const arrayContent = configContent.slice(arrayStart + 1, arrayEnd);
    const cases = parseDocCaseObjects(arrayContent);
    if (cases.length > 0) return cases;
  }
  return [];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findClosingBracketStrAware(content: string, start: number): number {
  const open = content[start];
  const close = open === "[" ? "]" : open === "{" ? "}" : ")";
  let depth = 1;
  let i = start + 1;
  while (i < content.length && depth > 0) {
    const ch = content[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipStringLiteral(content, i);
      continue;
    }
    if (ch === "/" && content[i + 1] === "/") {
      const nl = content.indexOf("\n", i);
      i = nl === -1 ? content.length : nl + 1;
      continue;
    }
    if (ch === "/" && content[i + 1] === "*") {
      const end = content.indexOf("*/", i + 2);
      i = end === -1 ? content.length : end + 2;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) depth--;
    i++;
  }
  return depth === 0 ? i - 1 : -1;
}

function skipStringLiteral(content: string, start: number): number {
  const quote = content[start];
  let i = start + 1;
  while (i < content.length) {
    if (content[i] === "\\" && quote !== "`") {
      i += 2;
      continue;
    }
    if (content[i] === "\\" && content[i + 1] === "`") {
      i += 2;
      continue;
    }
    if (content[i] === "\\" && content[i + 1] === "\\") {
      i += 2;
      continue;
    }
    if (content[i] === quote) return i + 1;
    i++;
  }
  return i;
}

function parseDocCaseObjects(arrayContent: string): DocCase[] {
  const results: DocCase[] = [];
  let i = 0;
  while (i < arrayContent.length) {
    const objStart = arrayContent.indexOf("{", i);
    if (objStart === -1) break;
    const objEnd = findClosingBracketStrAware(arrayContent, objStart);
    if (objEnd === -1) break;
    const objContent = arrayContent.slice(objStart + 1, objEnd);
    const description = extractStringProp(objContent, "description");
    const code = extractStringProp(objContent, "code");
    if (description !== null && code !== null) {
      results.push({ description, code });
    }
    i = objEnd + 1;
  }
  return results;
}

function extractStringProp(objContent: string, key: string): string | null {
  // `\b` keeps `description` from matching inside `compileDescription`
  // whichever order the two fields appear in.
  const re = new RegExp(`\\b${key}\\s*:\\s*`);
  const match = re.exec(objContent);
  if (!match) return null;
  let i = match.index + match[0].length;
  while (i < objContent.length && /\s/.test(objContent[i])) i++;
  const quote = objContent[i];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  let result = "";
  i++;
  while (i < objContent.length) {
    if (objContent[i] === "\\") {
      i++;
      if (i >= objContent.length) break;
      switch (objContent[i]) {
        case "n":
          result += "\n";
          break;
        case "t":
          result += "\t";
          break;
        case "\\":
          result += "\\";
          break;
        case quote:
          result += quote;
          break;
        default:
          result += objContent[i];
          break;
      }
      i++;
      continue;
    }
    if (objContent[i] === quote) return result;
    result += objContent[i];
    i++;
  }
  return null;
}

/** Strip the `## Examples` section from hand-written content. */
function stripExamplesSection(handWritten: string): string {
  const exRe = /\n*## Examples\b[^\n]*/;
  const match = exRe.exec(handWritten);
  if (!match) return handWritten;
  const before = handWritten.slice(0, match.index);
  const after = handWritten.slice(match.index + match[0].length);
  const nextHeading = after.search(/\n## /);
  const rest = nextHeading === -1 ? "" : after.slice(nextHeading);
  return before + rest;
}

// ── Markdown generation ──────────────────────────────────────────────

const HAND_WRITTEN_MARKER = "<!-- HAND-WRITTEN -->";

/** Experimental marker appended to names in sidebar labels and tables. */
const EXP_CHIP = ` ${EXPERIMENTAL_MARKER}`;

/** Frontmatter for a command/helper page: experimental items get the marker
 *  in their sidebar label (inside an experimental module the group label
 *  already carries it, so entry labels stay clean). */
function titleFrontmatter(label: string, itemExperimental: boolean): string[] {
  const lines = [`title: "${label}"`];
  if (itemExperimental) {
    lines.push(
      "experimental: true",
      "sidebar:",
      `  label: "${label}${EXP_CHIP}"`,
    );
  }
  return lines;
}

function preserveHandWritten(existingPath: string): string {
  if (!existsSync(existingPath)) return "";
  const content = readFileSync(existingPath, "utf-8");
  const idx = content.indexOf(HAND_WRITTEN_MARKER);
  if (idx === -1) return "";
  return content.slice(idx + HAND_WRITTEN_MARKER.length).trim();
}

function generateCommandDoc(mod: ModuleInfo, cmd: CommandMeta): string {
  const fullName = mod.prefix + cmd.name;
  const mdPath = join(mod.dir, "src/commands", `${cmd.name}.md`);
  const handWritten = preserveHandWritten(mdPath);
  const docCases = extractDocCases(mod.dir, "commands", cmd.name, cmd.name);

  const lines: string[] = [];
  lines.push(`---`);
  lines.push(...titleFrontmatter(fullName, cmd.experimental));
  lines.push(`---`);
  lines.push("");
  lines.push(cmd.description || "*No description available.*");
  lines.push("");
  // Module-level experimental applies to every item in it.
  if (mod.experimental || cmd.experimental) {
    lines.push(EXPERIMENTAL_BADGE);
    lines.push("");
  }

  // Syntax
  lines.push("## Syntax");
  lines.push("");
  lines.push("```evml");
  const syntaxParts = [fullName];
  for (const arg of cmd.argDefs) {
    if (arg.namedOnly) syntaxParts.push(`[${arg.name}:<value>]`);
    else if (arg.rest) syntaxParts.push(`[...${arg.name}]`);
    else if (arg.optional) syntaxParts.push(`[${arg.name}]`);
    else syntaxParts.push(`<${arg.name}>`);
  }
  lines.push(syntaxParts.join(" "));
  lines.push("```");
  lines.push("");

  // Arguments
  if (cmd.argDefs.length > 0) {
    lines.push("## Arguments");
    lines.push("");
    lines.push("| Name | Type | Description |");
    lines.push("|------|------|-------------|");
    for (const arg of cmd.argDefs) {
      const typeStr = Array.isArray(arg.type)
        ? arg.type.join(" \\| ")
        : arg.type;
      const rawName = arg.rest ? `...${arg.name}` : arg.name;
      const displayName = arg.namedOnly
        ? `${arg.name}:`
        : arg.optional || arg.rest
          ? `[${rawName}]`
          : rawName;
      lines.push(
        `| \`${displayName}\` | \`${typeStr}\` | ${arg.description ?? ""} |`,
      );
    }
    lines.push("");
  }

  // Options
  if (cmd.optDefs.length > 0) {
    lines.push("## Options");
    lines.push("");
    lines.push("| Name | Type | Description |");
    lines.push("|------|------|-------------|");
    for (const opt of cmd.optDefs) {
      const chip = opt.experimental ? EXP_CHIP : "";
      lines.push(
        `| \`--${opt.name}\`${chip} | \`${opt.type}\` | ${opt.description ?? ""} |`,
      );
    }
    lines.push("");
  }

  // Examples
  if (docCases.length > 0) {
    lines.push("## Examples");
    lines.push("");
    lines.push("```evml");
    for (let i = 0; i < docCases.length; i++) {
      if (i > 0) lines.push("");
      lines.push(`# ${docCases[i].description}`);
      lines.push(docCases[i].code);
    }
    lines.push("```");
    lines.push("");
  }

  lines.push(HAND_WRITTEN_MARKER);

  if (docCases.length > 0 && handWritten) {
    const stripped = stripExamplesSection(handWritten).trim();
    if (stripped) {
      lines.push("");
      lines.push(stripped);
    }
  } else if (handWritten) {
    lines.push("");
    lines.push(handWritten);
  } else {
    if (docCases.length === 0) {
      lines.push("");
      lines.push("## Examples");
      lines.push("");
      lines.push("```evml");
      lines.push(`# TODO: add examples`);
      lines.push("```");
    }
    lines.push("");
    lines.push("## See Also");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function generateHelperDoc(mod: ModuleInfo, helper: HelperMeta): string {
  const fullName = mod.prefix + helper.declaredName;
  const mdPath = join(mod.dir, "src/helpers", `${helper.name}.md`);
  const handWritten = preserveHandWritten(mdPath);
  const docCases = extractDocCases(
    mod.dir,
    "helpers",
    helper.name,
    mod.prefix + helper.declaredName,
  );

  const returnTypeStr = Array.isArray(helper.returnType)
    ? helper.returnType.join(" | ")
    : helper.returnType;

  const lines: string[] = [];
  lines.push(`---`);
  lines.push(...titleFrontmatter(`@${fullName}`, helper.experimental));
  lines.push(`---`);
  lines.push("");
  lines.push(helper.description || "*No description available.*");
  lines.push("");
  // The `!`-only note, if the helper declares one. Compile-only helpers
  // already carry the `!` in `declaredName`, so it reads as one sentence
  // there rather than a contrast between two faces.
  if (helper.compileDescription) {
    const face = helper.declaredName.endsWith("!")
      ? `@${fullName}`
      : `@${fullName}!`;
    lines.push(`**On-chain (\`${face}\`)**: ${helper.compileDescription}`);
    lines.push("");
  }
  // Module-level experimental applies to every item in it.
  if (mod.experimental || helper.experimental) {
    lines.push(EXPERIMENTAL_BADGE);
    lines.push("");
  }
  lines.push(`**Returns**: \`${returnTypeStr}\``);
  lines.push("");

  // Syntax
  lines.push("## Syntax");
  lines.push("");
  if (helper.hasArgs) {
    const argParts = helper.argDefs.map((a) => {
      if (a.namedOnly) return `${a.name}:<value>`;
      if (a.rest) return `...${a.name}`;
      if (a.optional) return `${a.name}?`;
      return a.name;
    });
    lines.push("```evml");
    lines.push(`@${fullName}(${argParts.join(" ")})`);
    lines.push("```");
  } else {
    lines.push("```evml");
    lines.push(`@${fullName}`);
    lines.push("```");
  }
  lines.push("");

  // Arguments
  if (helper.argDefs.length > 0) {
    lines.push("## Arguments");
    lines.push("");
    lines.push("| Name | Type | Description |");
    lines.push("|------|------|-------------|");
    for (const arg of helper.argDefs) {
      const typeStr = Array.isArray(arg.type)
        ? arg.type.join(" \\| ")
        : arg.type;
      const rawName = arg.rest ? `...${arg.name}` : arg.name;
      const displayName = arg.namedOnly
        ? `${arg.name}:`
        : arg.optional || arg.rest
          ? `[${rawName}]`
          : rawName;
      lines.push(
        `| \`${displayName}\` | \`${typeStr}\` | ${arg.description ?? ""} |`,
      );
    }
    lines.push("");
  }

  // Examples
  if (docCases.length > 0) {
    lines.push("## Examples");
    lines.push("");
    lines.push("```evml");
    for (let i = 0; i < docCases.length; i++) {
      if (i > 0) lines.push("");
      lines.push(`# ${docCases[i].description}`);
      lines.push(docCases[i].code);
    }
    lines.push("```");
    lines.push("");
  }

  lines.push(HAND_WRITTEN_MARKER);

  if (docCases.length > 0 && handWritten) {
    const stripped = stripExamplesSection(handWritten).trim();
    if (stripped) {
      lines.push("");
      lines.push(stripped);
    }
  } else if (handWritten) {
    lines.push("");
    lines.push(handWritten);
  } else {
    if (docCases.length === 0) {
      lines.push("");
      lines.push("## Examples");
      lines.push("");
      lines.push("```evml");
      lines.push(`# TODO: add examples`);
      lines.push("```");
    }
    lines.push("");
    lines.push("## See Also");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

interface ConfigMeta {
  name: string;
  type: string | string[];
  description: string;
  default?: string;
}

/** Load a module's declared config variables from its literal-only
 *  `src/configs.ts` (imported directly — bun resolves TS). */
function extractConfigs(mod: ModuleInfo): ConfigMeta[] {
  const configsPath = join(mod.dir, "src/configs.ts");
  if (!existsSync(configsPath)) return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require(configsPath).configs ?? []) as ConfigMeta[];
  } catch {
    return [];
  }
}

interface ChainMeta {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl?: string;
  testnet?: boolean;
}

/** Load a module's shipped chains from its literal-only `src/chains.ts`. */
function extractChains(mod: ModuleInfo): ChainMeta[] {
  const chainsPath = join(mod.dir, "src/chains.ts");
  if (!existsSync(chainsPath)) return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require(chainsPath).chains ?? []) as ChainMeta[];
  } catch {
    return [];
  }
}

/** Starlight page slug for a doc file name: lowercased, dots stripped
 *  (e.g. `abi.decode` → `abidecode`). */
function starlightSlug(name: string): string {
  return name.toLowerCase().replace(/\./g, "");
}

function generateModuleIndex(
  mod: ModuleInfo,
  commands: CommandMeta[],
  helpers: HelperMeta[],
  target: "repo" | "website" = "repo",
): string {
  const website = target === "website";
  const commandLink = (name: string) =>
    website
      ? `/reference/${mod.name}/commands/${starlightSlug(name)}/`
      : `src/commands/${name}.md`;
  const helperLink = (name: string) =>
    website
      ? `/reference/${mod.name}/helpers/${starlightSlug(name)}/`
      : `src/helpers/${name}.md`;

  const lines: string[] = [];
  if (website) {
    lines.push("---");
    lines.push(`title: "${mod.name}"`);
    lines.push("---");
  } else {
    lines.push(`# ${mod.name} module`);
  }
  lines.push("");
  lines.push(mod.overview);
  lines.push("");
  if (mod.experimental) {
    lines.push(EXPERIMENTAL_BADGE);
    lines.push("");
  }

  if (mod.name !== "std") {
    lines.push("```evml");
    lines.push(`load ${mod.name}`);
    lines.push("```");
    lines.push("");
  }

  const configs = extractConfigs(mod);
  if (configs.length > 0) {
    lines.push("## Configuration variables");
    lines.push("");
    lines.push(
      "Config variables are set with `set` (fully qualified, including the module prefix) and are only readable by their own module and the user script.",
    );
    lines.push("");
    lines.push("| Variable | Type | Default | Description |");
    lines.push("|----------|------|---------|-------------|");
    for (const c of configs) {
      const type = Array.isArray(c.type) ? c.type.join(" \\| ") : c.type;
      const def = c.default !== undefined ? `\`${c.default}\`` : "—";
      lines.push(
        `| \`$${mod.name}:${c.name}\` | \`${type}\` | ${def} | ${c.description} |`,
      );
    }
    lines.push("");
  }

  const chains = extractChains(mod);
  if (chains.length > 0) {
    lines.push("## Chains");
    lines.push("");
    lines.push(
      "Networks this module ships. They are available to `switch` as soon as the module is registered, with the RPC below unless the host overrides it.",
    );
    lines.push("");
    lines.push("| Chain | Id | RPC | Explorer |");
    lines.push("|-------|----|-----|----------|");
    for (const c of chains) {
      const explorer = c.explorerUrl ? `<${c.explorerUrl}>` : "—";
      lines.push(
        `| ${c.name}${c.testnet ? " (testnet)" : ""} | \`${c.id}\` | <${c.rpcUrl}> | ${explorer} |`,
      );
    }
    lines.push("");
  }

  if (commands.length > 0) {
    lines.push("## Commands");
    lines.push("");
    lines.push("| Command | Description |");
    lines.push("|---------|-------------|");
    for (const cmd of commands) {
      const link = `[${mod.prefix}${cmd.name}](${commandLink(cmd.name)})`;
      const chip = cmd.experimental ? EXP_CHIP : "";
      lines.push(`| ${link}${chip} | ${cmd.description} |`);
    }
    lines.push("");
  }

  if (helpers.length > 0) {
    lines.push("## Helpers");
    lines.push("");
    lines.push("| Helper | Returns | Description |");
    lines.push("|--------|---------|-------------|");
    for (const h of helpers) {
      const returnTypeStr = Array.isArray(h.returnType)
        ? h.returnType.join(" \\| ")
        : h.returnType;
      const link = `[@${mod.prefix}${h.declaredName}](${helperLink(h.name)})`;
      const chip = h.experimental ? EXP_CHIP : "";
      lines.push(
        `| ${link}${chip} | \`${returnTypeStr}\` | ${h.description} |`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

// ── Website symlinks ─────────────────────────────────────────────────

const { mkdirSync, symlinkSync, lstatSync, unlinkSync, rmSync } =
  require("node:fs");
const { dirname, relative } = require("node:path");

const WEBSITE_DOCS = join(
  ROOT,
  "apps/evmcrispr-website/src/content/docs/reference",
);

/** Create a relative symlink, replacing any existing file/symlink at dest. */
function ensureSymlink(target: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  const rel = relative(dirname(dest), target);
  try {
    const stat = lstatSync(dest);
    // Already correct symlink?
    if (stat.isSymbolicLink()) {
      const existing = readFileSync(dest, "utf-8");
      const expected = readFileSync(target, "utf-8");
      if (existing === expected) return;
    }
    unlinkSync(dest);
  } catch {}
  symlinkSync(rel, dest);
}

/** Remove broken symlinks from a directory. */
function cleanBrokenSymlinks(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    try {
      const stat = lstatSync(full);
      if (stat.isSymbolicLink() && !existsSync(full)) {
        unlinkSync(full);
      }
    } catch {}
  }
}

/** Drop reference directories for modules that no longer exist. Renaming a
 *  module (explorer -> receipts) otherwise leaves its whole tree behind:
 *  `cleanBrokenSymlinks` only visits directories of modules still present,
 *  so the orphan keeps its stale index page and dangling links. */
function pruneOrphanedModuleDirs(): void {
  if (!existsSync(WEBSITE_DOCS)) return;
  const live = new Set(MODULES.map((m) => m.name));
  for (const entry of readdirSync(WEBSITE_DOCS)) {
    const full = join(WEBSITE_DOCS, entry);
    if (!lstatSync(full).isDirectory() || live.has(entry)) continue;
    console.log(`  pruned orphaned reference dir ${entry}/`);
    rmSync(full, { recursive: true, force: true });
  }
}

pruneOrphanedModuleDirs();

// ── Main ─────────────────────────────────────────────────────────────

let totalCommands = 0;
let totalHelpers = 0;
const allDocs: string[] = [];

for (const mod of MODULES) {
  const { commands, helpers } = parseModuleSource(mod.dir);
  totalCommands += commands.length;
  totalHelpers += helpers.length;

  // The committed in-tree markdown (README + src/**/*.md) is always full;
  // the website tree and llms-full.txt only include what the current env
  // exposes.
  const moduleHidden = mod.experimental && !EXPERIMENTAL_ON;
  const visibleCommands = EXPERIMENTAL_ON
    ? commands
    : commands.filter((c) => !c.experimental);
  const visibleHelpers = EXPERIMENTAL_ON
    ? helpers
    : helpers.filter((h) => !h.experimental);

  // Clean up stale symlinks from previous runs
  cleanBrokenSymlinks(join(WEBSITE_DOCS, mod.name, "commands"));
  cleanBrokenSymlinks(join(WEBSITE_DOCS, mod.name, "helpers"));

  // Write module index (repo README + website landing page)
  const indexDoc = generateModuleIndex(mod, commands, helpers);
  writeIfChanged(join(mod.dir, "README.md"), indexDoc);
  if (moduleHidden) {
    // Remove any stale website tree from a previous flag-enabled run — the
    // sidebar and Starlight pages are driven purely by directory presence.
    rmSync(join(WEBSITE_DOCS, mod.name), { recursive: true, force: true });
  } else {
    allDocs.push(generateModuleIndex(mod, visibleCommands, visibleHelpers));
    mkdirSync(join(WEBSITE_DOCS, mod.name), { recursive: true });
    writeIfChanged(
      join(WEBSITE_DOCS, mod.name, "index.md"),
      generateModuleIndex(mod, visibleCommands, visibleHelpers, "website"),
    );
  }

  // Write command docs
  for (const cmd of commands) {
    const doc = generateCommandDoc(mod, cmd);
    const outPath = join(mod.dir, "src/commands", `${cmd.name}.md`);
    writeIfChanged(outPath, doc);

    const webPath = join(WEBSITE_DOCS, mod.name, "commands", `${cmd.name}.md`);
    if (moduleHidden || !visibleCommands.includes(cmd)) {
      // Hidden item in a visible module: drop its (valid) website symlink.
      if (!moduleHidden) rmIfExists(webPath);
      continue;
    }
    allDocs.push(doc);
    ensureSymlink(outPath, webPath);
  }

  // Write helper docs
  for (const helper of helpers) {
    const doc = generateHelperDoc(mod, helper);
    const outPath = join(mod.dir, "src/helpers", `${helper.name}.md`);
    writeIfChanged(outPath, doc);

    const webPath = join(
      WEBSITE_DOCS,
      mod.name,
      "helpers",
      `${helper.name}.md`,
    );
    if (moduleHidden || !visibleHelpers.includes(helper)) {
      if (!moduleHidden) rmIfExists(webPath);
      continue;
    }
    allDocs.push(doc);
    ensureSymlink(outPath, webPath);
  }
}

function rmIfExists(path: string): void {
  try {
    lstatSync(path);
    unlinkSync(path);
  } catch {}
}

// Generate llms-full.txt in website public/. Committed docs keep their
// `:::experimental` blocks verbatim; this env-dependent artifact resolves
// them (strip when off, badge when on) via the shared sdk transform.
const WEBSITE_PUBLIC = join(ROOT, "apps/evmcrispr-website/public");
const llmsFull = allDocs
  .map((doc) => transformExperimentalMd(doc, EXPERIMENTAL_ON))
  .join("\n---\n\n");
writeIfChanged(join(WEBSITE_PUBLIC, "llms-full.txt"), llmsFull);

console.log(
  `generate-docs: ${totalCommands} commands, ${totalHelpers} helpers, ${MODULES.length} modules`,
);

function writeIfChanged(path: string, content: string): void {
  if (existsSync(path) && readFileSync(path, "utf-8") === content) return;
  writeFileSync(path, content);
  console.log(`  wrote ${path.replace(`${ROOT}/`, "")}`);
}

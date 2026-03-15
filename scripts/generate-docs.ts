#!/usr/bin/env bun
/**
 * Documentation generator for EVMcrispr.
 *
 * Reads _generated.ts metadata from each module and produces Markdown
 * reference docs co-located with the source files:
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
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

// ── Module registry ──────────────────────────────────────────────────

interface ModuleInfo {
  name: string;
  prefix: string; // e.g. "aragonos:" or "" for std
  dir: string; // absolute path to modules/<mod>
  overview: string;
}

const MODULES: ModuleInfo[] = [
  {
    name: "std",
    prefix: "",
    dir: join(ROOT, "modules/std"),
    overview:
      "The standard module is loaded by default. It provides core language constructs, " +
      "contract interaction, control flow, and data manipulation.",
  },
  {
    name: "aragonos",
    prefix: "aragonos:",
    dir: join(ROOT, "modules/aragonos"),
    overview:
      "Aragon DAO operations: connect to DAOs, manage permissions, install and upgrade apps.",
  },
  {
    name: "sim",
    prefix: "sim:",
    dir: join(ROOT, "modules/sim"),
    overview:
      "Simulation module: fork chains and execute commands in a sandboxed environment " +
      "using Anvil, Hardhat, Tenderly, or EthereumJS backends.",
  },
  {
    name: "ens",
    prefix: "ens:",
    dir: join(ROOT, "modules/ens"),
    overview: "ENS domain operations: renewal and content hash encoding.",
  },
  {
    name: "giveth",
    prefix: "giveth:",
    dir: join(ROOT, "modules/giveth"),
    overview:
      "Giveth protocol operations: donations, GIVbacks distribution, and project resolution.",
  },
  {
    name: "http",
    prefix: "http:",
    dir: join(ROOT, "modules/http"),
    overview:
      "HTTP and JSON helpers: fetch URLs, parse JSON, and construct JSON strings.",
  },
];

// ── Types ────────────────────────────────────────────────────────────

interface ArgDef {
  name: string;
  type: string | string[];
  optional?: boolean;
  rest?: boolean;
  signatureArgIndex?: number;
}

interface OptDef {
  name: string;
  type: string;
}

interface CommandMeta {
  name: string;
  description: string;
  argDefs: ArgDef[];
  optDefs: OptDef[];
}

interface HelperMeta {
  name: string;
  description: string;
  returnType: string | string[];
  hasArgs: boolean;
  argDefs: ArgDef[];
}

// ── Parsing _generated.ts ────────────────────────────────────────────

function parseGenerated(modDir: string): {
  commands: CommandMeta[];
  helpers: HelperMeta[];
} {
  const genPath = join(modDir, "src/_generated.ts");
  if (!existsSync(genPath)) return { commands: [], helpers: [] };

  const content = readFileSync(genPath, "utf-8");
  const commands: CommandMeta[] = [];
  const helpers: HelperMeta[] = [];

  // Parse command entries
  const cmdBlock = extractBlock(content, "commands");
  if (cmdBlock) {
    const entryRe = /"([^"]+)":\s*\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(cmdBlock)) !== null) {
      const name = m[1];
      const body = m[2];
      const descMatch = body.match(/description:\s*"([^"]+)"/);
      const description = descMatch?.[1] ?? "";

      // Read opts from source file
      const optDefs = extractOptsFromSource(modDir, "commands", name);
      // Read args from source file (more reliable for commands)
      const argDefs = extractArgsFromSource(modDir, "commands", name);

      commands.push({ name, description, argDefs, optDefs });
    }
  }

  // Parse helper entries
  const helperBlock = extractBlock(content, "helpers");
  if (helperBlock) {
    // Match each helper entry — need bracket-aware parsing
    const entries = parseHelperEntries(helperBlock);
    for (const entry of entries) {
      const descMatch = entry.body.match(/description:\s*"([^"]+)"/);
      const returnTypeMatch = entry.body.match(/returnType:\s*"([^"]+)"/);
      const hasArgsMatch = entry.body.match(/hasArgs:\s*(true|false)/);

      const argDefs: ArgDef[] = [];
      const argDefsBlock = extractBracketContent(entry.body, "argDefs");
      if (argDefsBlock) {
        const objRe = /\{([^}]+)\}/g;
        let am: RegExpExecArray | null;
        while ((am = objRe.exec(argDefsBlock)) !== null) {
          const obj = am[1];
          const nameMatch = obj.match(/name:\s*"([^"]+)"/);
          const typeMatch = obj.match(/type:\s*"([^"]+)"/);
          if (nameMatch && typeMatch) {
            const arg: ArgDef = { name: nameMatch[1], type: typeMatch[1] };
            if (/optional:\s*true/.test(obj)) arg.optional = true;
            if (/rest:\s*true/.test(obj)) arg.rest = true;
            argDefs.push(arg);
          }
        }
      }

      helpers.push({
        name: entry.name,
        description: descMatch?.[1] ?? "",
        returnType: returnTypeMatch?.[1] ?? "any",
        hasArgs: hasArgsMatch?.[1] === "true",
        argDefs,
      });
    }
  }

  return { commands, helpers };
}

function extractBlock(content: string, varName: string): string | null {
  const re = new RegExp(`export const ${varName}[^=]*=\\s*\\{`);
  const match = re.exec(content);
  if (!match) return null;
  const start = content.indexOf("{", match.index + match[0].length - 1);
  let depth = 1;
  let i = start + 1;
  while (i < content.length && depth > 0) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") depth--;
    i++;
  }
  return content.slice(start + 1, i - 1);
}

function parseHelperEntries(
  block: string,
): { name: string; body: string }[] {
  const entries: { name: string; body: string }[] = [];
  const re = /"([^"]+)":\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const name = m[1];
    const bodyStart = block.indexOf("{", m.index + m[0].length - 1);
    let depth = 1;
    let i = bodyStart + 1;
    while (i < block.length && depth > 0) {
      if (block[i] === "{") depth++;
      else if (block[i] === "}") depth--;
      i++;
    }
    entries.push({ name, body: block.slice(bodyStart + 1, i - 1) });
    re.lastIndex = i;
  }
  return entries;
}

function extractBracketContent(text: string, key: string): string | null {
  const re = new RegExp(`${key}:\\s*\\[`);
  const match = re.exec(text);
  if (!match) return null;
  const start = text.indexOf("[", match.index);
  let depth = 1;
  let i = start + 1;
  while (i < text.length && depth > 0) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") depth--;
    i++;
  }
  return text.slice(start + 1, i - 1);
}

// ── Extract args/opts from source .ts files ──────────────────────────

function extractArgsFromSource(
  modDir: string,
  kind: string,
  name: string,
): ArgDef[] {
  const filePath = join(modDir, "src", kind, `${name}.ts`);
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8");

  const argsBlock = extractSourceArrayBlock(content, "args");
  if (!argsBlock) return [];

  return parseArgObjects(argsBlock);
}

function extractOptsFromSource(
  modDir: string,
  kind: string,
  name: string,
): OptDef[] {
  const filePath = join(modDir, "src", kind, `${name}.ts`);
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8");

  const optsBlock = extractSourceArrayBlock(content, "opts");
  if (!optsBlock) return [];

  const opts: OptDef[] = [];
  const objRe = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(optsBlock)) !== null) {
    const nameMatch = m[1].match(/name:\s*(?:"([^"]+)"|([A-Za-z_]\w*))/);
    const typeMatch = m[1].match(/type:\s*"([^"]+)"/);
    if (nameMatch && typeMatch) {
      let optName = nameMatch[1] ?? nameMatch[2];
      // Resolve constant references by searching the file for their definition
      if (!nameMatch[1] && optName) {
        optName = resolveConstant(content, modDir, optName, filePath);
      }
      opts.push({ name: optName, type: typeMatch[1] });
    }
  }
  return opts;
}

/** Try to resolve a constant like DAO_OPT_NAME to its string value. */
function resolveConstant(
  fileContent: string,
  modDir: string,
  constName: string,
  filePath?: string,
): string {
  // Check local definition: const FOO = "bar"
  const localRe = new RegExp(
    `(?:const|let|var)\\s+${constName}\\s*=\\s*"([^"]+)"`,
  );
  const localMatch = fileContent.match(localRe);
  if (localMatch) return localMatch[1];

  // Check imports and resolve from source files
  const importRe = new RegExp(
    `import\\s*\\{[^}]*\\b${constName}\\b[^}]*\\}\\s*from\\s*"([^"]+)"`,
  );
  const importMatch = fileContent.match(importRe);
  if (importMatch) {
    const importPath = importMatch[1];
    // Resolve relative to the file's directory
    const { dirname } = require("node:path");
    const fileDir = filePath ? dirname(filePath) : join(modDir, "src");
    const candidates = [
      resolve(fileDir, importPath + ".ts"),
      resolve(fileDir, importPath, "index.ts"),
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

  return constName; // fallback to constant name
}

function extractSourceArrayBlock(
  content: string,
  key: string,
): string | null {
  // Find the defineCommand/defineHelper({ ... }) call and extract the key array within it
  const defMatch = content.match(
    /(?:defineCommand|defineHelper)\s*(?:<[^>]+>)?\s*\(\s*\{/,
  );
  if (!defMatch) return null;

  // Find the opening brace of the config object
  const configStart = content.indexOf("{", defMatch.index! + defMatch[0].length - 1);

  // Find the key: [ within the config object (search from config start)
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
  // Simple object extraction - handles nested objects by tracking depth
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
    const typeMatch = objContent.match(/type:\s*"([^"]+)"/);
    if (nameMatch && typeMatch) {
      const arg: ArgDef = { name: nameMatch[1], type: typeMatch[1] };
      if (/optional:\s*true/.test(objContent)) arg.optional = true;
      if (/rest:\s*true/.test(objContent)) arg.rest = true;
      args.push(arg);
    }
    i = j;
  }
  return args;
}

// ── Markdown generation ──────────────────────────────────────────────

const HAND_WRITTEN_MARKER = "<!-- HAND-WRITTEN -->";

/** Add Starlight-compatible frontmatter to a doc, replacing the h1 heading. */
function addFrontmatter(doc: string, title: string): string {
  // Remove the first # heading line since Starlight uses the title from frontmatter
  const withoutH1 = doc.replace(/^# .+\n+/, "");
  return `---\ntitle: "${title}"\n---\n\n${withoutH1}`;
}

function preserveHandWritten(existingPath: string): string {
  if (!existsSync(existingPath)) return "";
  const content = readFileSync(existingPath, "utf-8");
  const idx = content.indexOf(HAND_WRITTEN_MARKER);
  if (idx === -1) return "";
  return content.slice(idx + HAND_WRITTEN_MARKER.length);
}

function generateCommandDoc(
  mod: ModuleInfo,
  cmd: CommandMeta,
): string {
  const fullName = mod.prefix + cmd.name;
  const mdPath = join(mod.dir, "src/commands", `${cmd.name}.md`);
  const handWritten = preserveHandWritten(mdPath);

  const lines: string[] = [];
  lines.push(`# ${fullName}`);
  lines.push("");
  lines.push(cmd.description || "*No description available.*");
  lines.push("");

  // Syntax
  lines.push("## Syntax");
  lines.push("");
  lines.push("```");
  const syntaxParts = [fullName];
  for (const arg of cmd.argDefs) {
    if (arg.rest) {
      syntaxParts.push(`[...${arg.name}]`);
    } else if (arg.optional) {
      syntaxParts.push(`[${arg.name}]`);
    } else {
      syntaxParts.push(`<${arg.name}>`);
    }
  }
  lines.push(syntaxParts.join(" "));
  lines.push("```");
  lines.push("");

  // Arguments
  if (cmd.argDefs.length > 0) {
    lines.push("## Arguments");
    lines.push("");
    lines.push("| Name | Type | Required |");
    lines.push("|------|------|----------|");
    for (const arg of cmd.argDefs) {
      const typeStr = Array.isArray(arg.type)
        ? arg.type.join(" \\| ")
        : arg.type;
      const required = arg.optional || arg.rest ? "No" : "Yes";
      const name = arg.rest ? `...${arg.name}` : arg.name;
      lines.push(`| ${name} | \`${typeStr}\` | ${required} |`);
    }
    lines.push("");
  }

  // Options
  if (cmd.optDefs.length > 0) {
    lines.push("## Options");
    lines.push("");
    lines.push("| Name | Type |");
    lines.push("|------|------|");
    for (const opt of cmd.optDefs) {
      lines.push(`| --${opt.name} | \`${opt.type}\` |`);
    }
    lines.push("");
  }

  lines.push(HAND_WRITTEN_MARKER);

  if (handWritten) {
    lines.push(handWritten.trimEnd());
  } else {
    lines.push("");
    lines.push("## Examples");
    lines.push("");
    lines.push("```");
    lines.push(`# TODO: add examples`);
    lines.push("```");
    lines.push("");
    lines.push("## See Also");
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

function generateHelperDoc(
  mod: ModuleInfo,
  helper: HelperMeta,
): string {
  const fullName = mod.prefix + helper.name;
  const mdPath = join(mod.dir, "src/helpers", `${helper.name}.md`);
  const handWritten = preserveHandWritten(mdPath);

  const returnTypeStr = Array.isArray(helper.returnType)
    ? helper.returnType.join(" | ")
    : helper.returnType;

  const lines: string[] = [];
  lines.push(`# @${fullName}`);
  lines.push("");
  lines.push(helper.description || "*No description available.*");
  lines.push("");
  lines.push(`**Returns**: \`${returnTypeStr}\``);
  lines.push("");

  // Syntax
  lines.push("## Syntax");
  lines.push("");
  if (helper.hasArgs) {
    const argParts = helper.argDefs.map((a) => {
      if (a.rest) return `...${a.name}`;
      if (a.optional) return `${a.name}?`;
      return a.name;
    });
    lines.push("```");
    lines.push(`@${fullName}(${argParts.join(", ")})`);
    lines.push("```");
  } else {
    lines.push("```");
    lines.push(`@${fullName}`);
    lines.push("```");
  }
  lines.push("");

  // Arguments
  if (helper.argDefs.length > 0) {
    lines.push("## Arguments");
    lines.push("");
    lines.push("| Name | Type | Required |");
    lines.push("|------|------|----------|");
    for (const arg of helper.argDefs) {
      const typeStr = Array.isArray(arg.type)
        ? arg.type.join(" \\| ")
        : arg.type;
      const required = arg.optional || arg.rest ? "No" : "Yes";
      const name = arg.rest ? `...${arg.name}` : arg.name;
      lines.push(`| ${name} | \`${typeStr}\` | ${required} |`);
    }
    lines.push("");
  }

  lines.push(HAND_WRITTEN_MARKER);

  if (handWritten) {
    lines.push(handWritten.trimEnd());
  } else {
    lines.push("");
    lines.push("## Examples");
    lines.push("");
    lines.push("```");
    lines.push(`# TODO: add examples`);
    lines.push("```");
    lines.push("");
    lines.push("## See Also");
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

function generateModuleIndex(
  mod: ModuleInfo,
  commands: CommandMeta[],
  helpers: HelperMeta[],
): string {
  const lines: string[] = [];
  lines.push(`# ${mod.name} module`);
  lines.push("");
  lines.push(mod.overview);
  lines.push("");

  if (mod.name !== "std") {
    lines.push("```");
    lines.push(`load ${mod.name}`);
    lines.push("```");
    lines.push("");
  }

  if (commands.length > 0) {
    lines.push("## Commands");
    lines.push("");
    lines.push("| Command | Description |");
    lines.push("|---------|-------------|");
    for (const cmd of commands) {
      const link = `[${mod.prefix}${cmd.name}](src/commands/${cmd.name}.md)`;
      lines.push(`| ${link} | ${cmd.description} |`);
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
      const link = `[@${mod.prefix}${h.name}](src/helpers/${h.name}.md)`;
      lines.push(`| ${link} | \`${returnTypeStr}\` | ${h.description} |`);
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

// ── Main ─────────────────────────────────────────────────────────────

const WEBSITE_DOCS = join(
  ROOT,
  "apps/evmcrispr-website/src/content/docs/reference",
);

let totalCommands = 0;
let totalHelpers = 0;
const allDocs: string[] = [];

for (const mod of MODULES) {
  const { commands, helpers } = parseGenerated(mod.dir);
  totalCommands += commands.length;
  totalHelpers += helpers.length;

  const webModDir = join(WEBSITE_DOCS, mod.name);

  // Write command docs
  for (const cmd of commands) {
    const doc = generateCommandDoc(mod, cmd);
    const outPath = join(mod.dir, "src/commands", `${cmd.name}.md`);
    writeIfChanged(outPath, doc);
    allDocs.push(doc);

    // Also write to website content (Starlight) with frontmatter
    const webDoc = addFrontmatter(doc, mod.prefix + cmd.name);
    const webPath = join(webModDir, "commands", `${cmd.name}.md`);
    writeIfChanged(webPath, webDoc, true);
  }

  // Write helper docs
  for (const helper of helpers) {
    const doc = generateHelperDoc(mod, helper);
    const outPath = join(mod.dir, "src/helpers", `${helper.name}.md`);
    writeIfChanged(outPath, doc);
    allDocs.push(doc);

    // Also write to website content (Starlight) with frontmatter
    const webDoc = addFrontmatter(doc, `@${mod.prefix}${helper.name}`);
    const webPath = join(webModDir, "helpers", `${helper.name}.md`);
    writeIfChanged(webPath, webDoc, true);
  }

  // Write module index
  const indexDoc = generateModuleIndex(mod, commands, helpers);
  const indexPath = join(mod.dir, "README.md");
  writeIfChanged(indexPath, indexDoc);
}

// Generate llms-full.txt directly in website public/
const WEBSITE_PUBLIC = join(ROOT, "apps/evmcrispr-website/public");
const llmsFull = allDocs.join("\n---\n\n");
writeIfChanged(join(WEBSITE_PUBLIC, "llms-full.txt"), llmsFull);

console.log(
  `generate-docs: ${totalCommands} commands, ${totalHelpers} helpers, ${MODULES.length} modules`,
);

function writeIfChanged(
  path: string,
  content: string,
  mkdirs = false,
): void {
  if (existsSync(path) && readFileSync(path, "utf-8") === content) return;
  if (mkdirs) {
    const { mkdirSync } = require("node:fs");
    const { dirname } = require("node:path");
    mkdirSync(dirname(path), { recursive: true });
  }
  writeFileSync(path, content);
  console.log(`  wrote ${path.replace(ROOT + "/", "")}`);
}

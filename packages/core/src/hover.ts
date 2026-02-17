import type {
  CommandExpressionNode,
  HelperArgDefEntry,
  ICommand,
  ModuleBinding,
  NoNullableBinding,
  Position,
} from "@evmcrispr/sdk";
import {
  type BindingsManager,
  BindingsSpace,
  resolveCommand,
} from "@evmcrispr/sdk";

import type { EvmlAST } from "./EvmlAST";
import { parseScript } from "./parsers/script";

const { MODULE } = BindingsSpace;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HoverInfo = {
  /** Markdown-formatted hover content. */
  contents: string;
};

// ---------------------------------------------------------------------------
// Token detection
// ---------------------------------------------------------------------------

type TokenKind = "helper" | "variable" | "option" | "identifier";

interface Token {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
}

const TOKEN_RE = /@[\w.]+|\$[\w]+|--[\w-]+|[\w:-]+/g;

function getTokenAtCol(lineText: string, col: number): Token | null {
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (col >= start && col < end) {
      const value = match[0];
      let kind: TokenKind = "identifier";
      if (value.startsWith("@")) kind = "helper";
      else if (value.startsWith("$")) kind = "variable";
      else if (value.startsWith("--")) kind = "option";
      return { kind, value, start, end };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Module cache lookups
// ---------------------------------------------------------------------------

function getAllModules(moduleCache: BindingsManager) {
  return moduleCache.getAllBindings({
    spaceFilters: [MODULE],
    ignoreNullValues: true,
  }) as NoNullableBinding<ModuleBinding>[];
}

async function resolveCommandFromCache(
  commandName: string,
  moduleName: string | undefined,
  moduleCache: BindingsManager,
): Promise<{ command: ICommand; resolvedModule: string } | null> {
  if (moduleName) {
    const moduleData = moduleCache.getBindingValue(moduleName, MODULE);
    if (!moduleData) return null;
    const entry = moduleData.commands[commandName];
    if (!entry) return null;
    return {
      command: await resolveCommand(entry),
      resolvedModule: moduleName,
    };
  }

  const allModules = getAllModules(moduleCache);

  for (const { identifier, value: mod } of allModules) {
    if (identifier === "std" && mod.commands[commandName]) {
      return {
        command: await resolveCommand(mod.commands[commandName]),
        resolvedModule: "std",
      };
    }
  }

  for (const { identifier, value: mod } of allModules) {
    if (identifier !== "std" && mod.commands[commandName]) {
      return {
        command: await resolveCommand(mod.commands[commandName]),
        resolvedModule: identifier,
      };
    }
  }

  return null;
}

function findHelperInCache(
  helperName: string,
  moduleCache: BindingsManager,
): {
  argDefs?: HelperArgDefEntry[];
  returnType?: string;
  description?: string;
  moduleName: string;
} | null {
  const allModules = getAllModules(moduleCache);

  for (const { identifier, value: mod } of allModules) {
    if (mod.helpers[helperName]) {
      return {
        argDefs: mod.helperArgDefs?.[helperName],
        returnType: mod.helperReturnTypes?.[helperName],
        description: mod.helperDescriptions?.[helperName],
        moduleName: identifier,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Markdown formatters
// ---------------------------------------------------------------------------

function formatCommandHover(
  commandName: string,
  moduleName: string | undefined,
  command: ICommand,
): string {
  const prefix = moduleName && moduleName !== "std" ? `${moduleName}:` : "";
  const parts: string[] = [];

  for (const a of command.argDefs) {
    const label = `${a.name}: ${a.type}${a.rest ? "..." : ""}`;
    parts.push(a.optional || a.rest ? `[${label}]` : `<${label}>`);
  }

  for (const o of command.optDefs) {
    parts.push(`[--${o.name} ${o.type}]`);
  }

  let result = `\`\`\`\n${prefix}${commandName} ${parts.join(" ")}\n\`\`\``;
  if (command.description) {
    result += `\n${command.description}`;
  }
  return result;
}

function formatHelperHover(
  helperName: string,
  argDefs: HelperArgDefEntry[] | undefined,
  returnType: string | undefined,
  description: string | undefined,
): string {
  const params = argDefs
    ? argDefs
        .map((a) => {
          const suffix = a.rest ? "..." : "";
          const opt = a.optional ? "?" : "";
          return `${a.name}${opt}: ${a.type}${suffix}`;
        })
        .join(", ")
    : "";
  const ret = returnType ? ` → ${returnType}` : "";
  let result = `\`\`\`\n@${helperName}(${params})${ret}\n\`\`\``;
  if (description) {
    result += `\n${description}`;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Command-name position check
// ---------------------------------------------------------------------------

function isOnCommandName(
  commandNode: CommandExpressionNode,
  col: number,
): boolean {
  const startCol = commandNode.loc?.start.col ?? 0;
  const moduleLen = (commandNode.module ?? "").length;
  const colonLen = commandNode.module ? 1 : 0;
  const endCol = startCol + moduleLen + colonLen + commandNode.name.length;
  return col >= startCol && col < endCol;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function getHoverInfo(
  script: string,
  position: Position,
  moduleCache: BindingsManager,
): Promise<HoverInfo | null> {
  const scriptLines = script.split("\n");
  const lineText = scriptLines[position.line - 1];
  if (!lineText) return null;

  const token = getTokenAtCol(lineText, position.col);
  if (!token) return null;

  // --- helper: @name ---
  if (token.kind === "helper") {
    const name = token.value.slice(1);
    const info = findHelperInCache(name, moduleCache);
    if (!info) return null;
    return {
      contents: formatHelperHover(
        name,
        info.argDefs,
        info.returnType,
        info.description,
      ),
    };
  }

  // --- variable: $name ---
  if (token.kind === "variable") {
    const name = token.value.slice(1);
    let ast: EvmlAST;
    try {
      ast = parseScript(script).ast;
    } catch {
      return { contents: `\`\`\`\n${token.value}\n\`\`\`\n*(variable)*` };
    }

    const setNodes = ast
      .getCommandsUntilLine(position.line, ["set"])
      .filter(
        (c: CommandExpressionNode) =>
          c.name === "set" && c.args[0]?.value === name,
      );

    if (setNodes.length > 0) {
      const defLine = setNodes[setNodes.length - 1].loc?.start.line;
      const lineHint = defLine ? `  *(defined on line ${defLine})*` : "";
      return {
        contents: `\`\`\`\n${token.value}\n\`\`\`\n*(variable)*${lineHint}`,
      };
    }

    return { contents: `\`\`\`\n${token.value}\n\`\`\`\n*(variable)*` };
  }

  // --- option: --name (needs command context) ---
  if (token.kind === "option") {
    let ast: EvmlAST;
    try {
      ast = parseScript(script).ast;
    } catch {
      return null;
    }

    const commandNode = ast.getCommandAtLine(position.line);
    if (!commandNode) return null;

    const resolved = await resolveCommandFromCache(
      commandNode.name,
      commandNode.module,
      moduleCache,
    );
    if (!resolved) return null;

    const optName = token.value.slice(2);
    const optDef = resolved.command.optDefs.find((o) => o.name === optName);
    if (!optDef) return null;

    return { contents: `\`\`\`\n--${optDef.name}: ${optDef.type}\n\`\`\`` };
  }

  // --- identifier: might be a command name ---
  let ast: EvmlAST;
  try {
    ast = parseScript(script).ast;
  } catch {
    return null;
  }

  const commandNode = ast.getCommandAtLine(position.line);
  if (!commandNode) return null;

  if (isOnCommandName(commandNode, position.col)) {
    const resolved = await resolveCommandFromCache(
      commandNode.name,
      commandNode.module,
      moduleCache,
    );
    if (!resolved) return null;
    return {
      contents: formatCommandHover(
        commandNode.name,
        commandNode.module,
        resolved.command,
      ),
    };
  }

  return null;
}

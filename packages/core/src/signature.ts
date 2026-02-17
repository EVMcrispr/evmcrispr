import type {
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

import { parseScript } from "./parsers/script";

const { MODULE } = BindingsSpace;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParameterInfo = {
  label: string;
  documentation?: string;
};

export type SignatureInfo = {
  label: string;
  documentation?: string;
  parameters: ParameterInfo[];
};

export type SignatureHelp = {
  signatures: SignatureInfo[];
  activeSignature: number;
  activeParameter: number;
};

// ---------------------------------------------------------------------------
// Text-based helper detection
// ---------------------------------------------------------------------------

/**
 * Scan backwards from `offset` through `text` to find the innermost
 * unclosed `@helperName(` and count the commas at that nesting level
 * to determine the active parameter index.
 */
function findEnclosingHelper(
  text: string,
  offset: number,
): { name: string; activeParam: number } | null {
  let depth = 0;
  let commas = 0;

  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === ")") {
      depth++;
    } else if (ch === "(") {
      if (depth === 0) {
        // Found our opening paren — check if preceded by @helperName
        const before = text.slice(0, i);
        const match = before.match(/@([\w.]+)$/);
        if (match) {
          return { name: match[1], activeParam: commas };
        }
        return null;
      }
      depth--;
    } else if (ch === "," && depth === 0) {
      commas++;
    }
  }
  return null;
}

/**
 * Convert a 1-indexed line + 0-indexed col position to a 0-indexed
 * character offset within `text`.
 */
function positionToOffset(text: string, pos: Position): number {
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < pos.line - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  return offset + pos.col;
}

// ---------------------------------------------------------------------------
// Module cache lookups  (shared pattern with hover.ts)
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
} | null {
  const allModules = getAllModules(moduleCache);

  for (const { identifier, value: mod } of allModules) {
    if (mod.helpers[helperName]) {
      return {
        argDefs: mod.helperArgDefs?.[helperName],
        returnType: mod.helperReturnTypes?.[helperName],
        description: mod.helperDescriptions?.[helperName],
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Signature builders
// ---------------------------------------------------------------------------

function buildHelperSignature(
  helperName: string,
  argDefs: HelperArgDefEntry[],
  returnType: string | undefined,
  description: string | undefined,
): SignatureInfo {
  const params: ParameterInfo[] = argDefs.map((a) => {
    const suffix = a.rest ? "..." : "";
    const opt = a.optional ? "?" : "";
    return { label: `${a.name}${opt}: ${a.type}${suffix}` };
  });

  const paramLabels = params.map((p) => p.label).join(", ");
  const ret = returnType ? ` → ${returnType}` : "";
  const label = `@${helperName}(${paramLabels})${ret}`;

  return { label, documentation: description, parameters: params };
}

function buildCommandSignature(
  commandName: string,
  moduleName: string | undefined,
  command: ICommand,
): SignatureInfo {
  const prefix = moduleName && moduleName !== "std" ? `${moduleName}:` : "";

  const params: ParameterInfo[] = command.argDefs.map((a) => {
    const suffix = a.rest ? "..." : "";
    const label = `${a.name}: ${a.type}${suffix}`;
    return {
      label: a.optional || a.rest ? `[${label}]` : `<${label}>`,
    };
  });

  for (const o of command.optDefs) {
    params.push({ label: `[--${o.name} ${o.type}]` });
  }

  const label = `${prefix}${commandName} ${params.map((p) => p.label).join(" ")}`;

  return {
    label,
    documentation: command.description,
    parameters: params,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function getSignatureHelp(
  script: string,
  position: Position,
  moduleCache: BindingsManager,
): Promise<SignatureHelp | null> {
  const offset = positionToOffset(script, position);

  // 1. Check if we're inside a helper call  (text-based — works with
  //    incomplete input where the parser may not produce a node)
  const helper = findEnclosingHelper(script, offset);
  if (helper) {
    const info = findHelperInCache(helper.name, moduleCache);
    if (info?.argDefs && info.argDefs.length > 0) {
      const sig = buildHelperSignature(
        helper.name,
        info.argDefs,
        info.returnType,
        info.description,
      );
      return {
        signatures: [sig],
        activeSignature: 0,
        activeParameter: Math.min(
          helper.activeParam,
          sig.parameters.length - 1,
        ),
      };
    }
  }

  // 2. Fall back to command signature help  (AST-based)
  let ast;
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

  const { command } = resolved;
  if (command.argDefs.length === 0 && command.optDefs.length === 0) {
    return null;
  }

  // Determine if cursor is past the command name
  const startCol = commandNode.loc?.start.col ?? 0;
  const moduleLen = (commandNode.module ?? "").length;
  const colonLen = commandNode.module ? 1 : 0;
  const nameEnd = startCol + moduleLen + colonLen + commandNode.name.length;

  if (position.col <= nameEnd) return null;

  // Count which argument the cursor is on.
  // For commands, arguments are space-separated.  We count the number of
  // arg nodes whose start col is before the cursor.
  let activeParam = 0;
  for (const arg of commandNode.args) {
    if (arg.loc && arg.loc.start.col < position.col) {
      activeParam++;
    }
  }
  // activeParam is now the number of args before cursor; clamp to valid range
  activeParam = Math.min(activeParam, command.argDefs.length - 1);
  if (activeParam < 0) activeParam = 0;

  const sig = buildCommandSignature(
    commandNode.name,
    commandNode.module,
    command,
  );

  return {
    signatures: [sig],
    activeSignature: 0,
    activeParameter: activeParam,
  };
}

import type { HelperArgDefEntry, ICommand, Position } from "@evmcrispr/sdk";
import {
  type BindingsManager,
  BindingsSpace,
  resolveArgDefIndex,
  resolveCommand,
} from "@evmcrispr/sdk";

import { parseScript } from "./parsers/script";
import { collectScriptImports } from "./scriptWalk";

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
): { module?: string; name: string; activeParam: number } | null {
  let depth = 0;
  let commas = 0;

  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === ")") {
      depth++;
    } else if (ch === "(") {
      if (depth === 0) {
        // Found our opening paren — check if preceded by @[module:]helperName
        const before = text.slice(0, i);
        const match = before.match(/@(?:([\w-]+):)?([\w.]+)$/);
        if (match) {
          return { module: match[1], name: match[2], activeParam: commas };
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

async function resolveCommandFromCache(
  commandName: string,
  moduleName: string | undefined,
  moduleCache: BindingsManager,
  imports: Map<string, { module: string; name: string }>,
): Promise<{ command: ICommand; resolvedModule: string } | null> {
  // Same resolution order as the runtime: qualified module → the script's
  // import list → std prelude. No cross-module search.
  let owner = moduleName;
  let localName = commandName;
  if (!owner) {
    const imported = imports.get(commandName);
    if (imported) {
      owner = imported.module;
      localName = imported.name;
    } else {
      owner = "std";
    }
  }

  const moduleData = moduleCache.getBindingValue(owner, MODULE);
  const entry = moduleData?.commands[localName];
  if (!entry) return null;
  return {
    command: await resolveCommand(entry),
    resolvedModule: owner,
  };
}

/** Resolve a helper the way the runtime does: qualified module → the
 *  script's import list → std prelude. */
function findHelperInCache(
  helper: { module?: string; name: string },
  moduleCache: BindingsManager,
  imports: Map<string, { module: string; name: string }>,
): {
  argDefs?: HelperArgDefEntry[];
  returnType?: string | string[];
  description?: string;
} | null {
  let owner = helper.module ?? "std";
  let localName = helper.name;
  if (!helper.module) {
    const imported = imports.get(`@${helper.name}`);
    if (imported) {
      owner = imported.module;
      localName = imported.name;
    }
  }
  const mod = moduleCache.getBindingValue(owner, BindingsSpace.MODULE);
  if (!mod?.helpers[localName]) return null;
  return {
    argDefs: mod.helperArgDefs?.[localName],
    returnType: mod.helperReturnTypes?.[localName],
    description: mod.helperDescriptions?.[localName],
  };
}

// ---------------------------------------------------------------------------
// Signature builders
// ---------------------------------------------------------------------------

function buildHelperSignature(
  helperName: string,
  argDefs: HelperArgDefEntry[],
  returnType: string | string[] | undefined,
  description: string | undefined,
): SignatureInfo {
  const params: ParameterInfo[] = argDefs.map((a) => {
    const suffix = a.rest ? "..." : "";
    const opt = a.optional ? "?" : "";
    const typeLabel = Array.isArray(a.type) ? a.type.join(" | ") : a.type;
    return { label: `${a.name}${opt}: ${typeLabel}${suffix}` };
  });

  const paramLabels = params.map((p) => p.label).join(", ");
  const retLabel = Array.isArray(returnType)
    ? returnType.join(" | ")
    : returnType;
  const ret = retLabel ? ` → ${retLabel}` : "";
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
    const typeLabel = Array.isArray(a.type) ? a.type.join(" | ") : a.type;
    const label = `${a.name}: ${typeLabel}${suffix}`;
    return {
      label: a.optional || a.rest ? `[${label}]` : `<${label}>`,
    };
  });

  for (const o of command.optDefs) {
    params.push({ label: `[--${o.name} ${o.type}]` });
  }

  const label = `${prefix}${commandName} ${params
    .map((p) => p.label)
    .join(" ")}`;

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
    const info = findHelperInCache(
      helper,
      moduleCache,
      collectScriptImports(script),
    );
    if (info?.argDefs && info.argDefs.length > 0) {
      const sig = buildHelperSignature(
        helper.module ? `${helper.module}:${helper.name}` : helper.name,
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
    collectScriptImports(script),
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
  // Map the positional index to its arg definition (optional special-typed
  // defs may have been skipped), then clamp to valid range
  const defIdx = resolveArgDefIndex(
    command.argDefs,
    commandNode.args,
    activeParam,
  );
  activeParam = defIdx >= 0 ? defIdx : activeParam;
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

import type {
  ArrayExpressionNode,
  CommandExpressionNode,
  HelperFunctionNode,
  Node,
} from "@evmcrispr/sdk";
import { NodeType, parseConfigVarName, parseImportList } from "@evmcrispr/sdk";
import { parseScript } from "./parsers/script";

export interface ScriptUsage {
  /** Canonical `module:name` of every command invocation. */
  commands: Set<string>;
  /** Canonical `module:name` of every helper invocation. */
  helpers: Set<string>;
  /** `module:key` of every `$mod:key` read or write. */
  configVars: Set<string>;
  /** Load-import bindings: local (possibly `>`-renamed) command name →
   *  canonical module + source name. */
  commandBindings: Map<string, { module: string; name: string }>;
  /** Load-import bindings for helpers, same shape as `commandBindings`. */
  helperBindings: Map<string, { module: string; name: string }>;
}

function isLoadCommand(c: CommandExpressionNode): boolean {
  return (c.module ?? "std") === "std" && c.name === "load";
}

function isDefCommand(c: CommandExpressionNode): boolean {
  return (c.module ?? "std") === "std" && c.name === "def";
}

/** Split a load target `name` / `name>alias` into its parts (null when the
 *  spelling is malformed). */
function splitLoadTarget(
  raw: string,
): { canonical: string; alias?: string } | null {
  const parts = raw.split(">");
  if (parts.length > 2 || parts.some((p) => !p.length)) return null;
  return { canonical: parts[0], alias: parts[1] };
}

/**
 * Static usage of commands, helpers and config variables in a script,
 * resolved to canonical names the same way the semantic analyzer does:
 * qualified prefix → load import binding (honoring `>` renames) → std;
 * `def`-defined local names are excluded. Never throws; returns null only
 * when the script does not parse at all (the per-line parser recovers from
 * most mid-edit breakage).
 */
export function collectScriptUsage(script: string): ScriptUsage | null {
  let commands: CommandExpressionNode[];
  try {
    commands = parseScript(script).ast.getAllCommandsUntilLine(
      Number.POSITIVE_INFINITY,
    );
  } catch {
    return null;
  }

  // ---- pass 1: import bindings, def names, non-usage nodes ---------------
  const importedCommands = new Map<string, { module: string; name: string }>();
  const importedHelpers = new Map<string, { module: string; name: string }>();
  const defCommands = new Set<string>();
  const defHelpers = new Set<string>();
  // Nodes that contain names, not invocations: load import lists and def
  // name nodes (defining `@double` is not a use of `std:double`).
  const skipNodes = new Set<Node>();

  for (const c of commands) {
    if (isLoadCommand(c)) {
      const rawTarget = c.args[0]?.value as string | undefined;
      const target = rawTarget ? splitLoadTarget(rawTarget) : null;
      const moduleName = target
        ? (target.alias ?? target.canonical)
        : rawTarget;
      const listNode = c.args[1];
      if (listNode?.type === NodeType.ArrayExpression) {
        skipNodes.add(listNode);
        if (moduleName) {
          const { entries } = parseImportList(listNode as ArrayExpressionNode);
          for (const entry of entries) {
            const ref = { module: moduleName, name: entry.sourceName };
            if (entry.kind === "command") {
              importedCommands.set(entry.boundName, ref);
            } else {
              importedHelpers.set(entry.boundName, ref);
            }
          }
        }
      }
    } else if (isDefCommand(c)) {
      const nameNode = c.args[0];
      if (nameNode?.type === NodeType.Bareword) {
        defCommands.add(nameNode.value as string);
      } else if (nameNode?.type === NodeType.HelperFunctionExpression) {
        defHelpers.add((nameNode as HelperFunctionNode).name);
      }
      if (nameNode) skipNodes.add(nameNode);
    }
  }

  // ---- pass 2: collect usage ---------------------------------------------
  const usage: ScriptUsage = {
    commands: new Set(),
    helpers: new Set(),
    configVars: new Set(),
    commandBindings: importedCommands,
    helperBindings: importedHelpers,
  };

  const visit = (node: Node): void => {
    if (skipNodes.has(node)) return;
    if (node.type === NodeType.HelperFunctionExpression) {
      const h = node as HelperFunctionNode;
      if (h.module) {
        usage.helpers.add(`${h.module}:${h.name}`);
      } else if (!defHelpers.has(h.name)) {
        const imported = importedHelpers.get(h.name);
        usage.helpers.add(
          imported ? `${imported.module}:${imported.name}` : `std:${h.name}`,
        );
      }
      for (const a of h.args) visit(a);
    } else if (node.type === NodeType.VariableIdentifier) {
      const cfg = parseConfigVarName(node.value as string);
      if (cfg) usage.configVars.add(`${cfg.module}:${cfg.key}`);
    } else if (node.type === NodeType.ArrayExpression) {
      for (const el of (node as ArrayExpressionNode).elements) visit(el);
    } else if (node.type === NodeType.CallExpression) {
      const call = node as Node & { target: Node; args: Node[] };
      visit(call.target);
      for (const a of call.args) visit(a);
    } else if (node.type === NodeType.NamedArg) {
      visit((node as any).value as Node);
    }
  };

  for (const c of commands) {
    if (c.module) {
      usage.commands.add(`${c.module}:${c.name}`);
    } else if (!defCommands.has(c.name)) {
      const imported = importedCommands.get(c.name);
      usage.commands.add(
        imported ? `${imported.module}:${imported.name}` : `std:${c.name}`,
      );
    }
    for (const arg of c.args) {
      if (arg.type !== NodeType.BlockExpression) visit(arg);
    }
    for (const opt of c.opts) visit(opt.value);
  }

  return usage;
}

import type {
  BlockExpressionNode,
  CommandExpressionNode,
  Location,
} from "@evmcrispr/sdk";
import { NodeType } from "@evmcrispr/sdk";

import type { EvmlAST } from "./EvmlAST";
import { parseScript } from "./parsers/script";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocumentSymbolKind = "command" | "block" | "variable";

export interface DocumentSymbol {
  /** Display name (e.g. "load aragon --as ar", "set $foo"). */
  name: string;
  /** Optional detail string (e.g. module prefix). */
  detail?: string;
  kind: DocumentSymbolKind;
  /** Full range of the symbol, including its block body if any. */
  range: {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  };
  /** Range of just the command name for selection/highlight. */
  selectionRange: {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  };
  /** Children symbols (commands inside a block expression). */
  children?: DocumentSymbol[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function locToRange(loc: Location) {
  return {
    startLine: loc.start.line,
    startCol: loc.start.col,
    endLine: loc.end.line,
    endCol: loc.end.col,
  };
}

/** Build a human-readable label for a command node. */
function commandLabel(c: CommandExpressionNode): string {
  const prefix = c.module ? `${c.module}:` : "";
  const name = `${prefix}${c.name}`;

  const argPreviews: string[] = [];
  for (const arg of c.args) {
    if (arg.type === NodeType.BlockExpression) break;
    if (arg.value != null) {
      const v = String(arg.value);
      argPreviews.push(v.length > 30 ? `${v.slice(0, 27)}…` : v);
    }
  }

  const opts = c.opts
    .map(
      (o) => `--${o.name}${o.value?.value != null ? ` ${o.value.value}` : ""}`,
    )
    .join(" ");

  const parts = [name, ...argPreviews];
  if (opts) parts.push(opts);
  return parts.join(" ");
}

/** Determine the kind for a command node. */
function commandKind(c: CommandExpressionNode): DocumentSymbolKind {
  if (c.name === "set") return "variable";
  const hasBlock = c.args.some((a) => a.type === NodeType.BlockExpression);
  if (hasBlock) return "block";
  return "command";
}

function selectionRange(c: CommandExpressionNode) {
  const startCol = c.loc?.start.col ?? 0;
  const moduleLen = (c.module ?? "").length;
  const colonLen = c.module ? 1 : 0;
  const endCol = startCol + moduleLen + colonLen + c.name.length;
  return {
    startLine: c.loc?.start.line ?? 1,
    startCol,
    endLine: c.loc?.start.line ?? 1,
    endCol,
  };
}

// ---------------------------------------------------------------------------
// AST walk
// ---------------------------------------------------------------------------

function symbolsFromCommands(
  commands: CommandExpressionNode[],
): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  for (const c of commands) {
    if (!c.loc) continue;

    const blockArg = c.args.find((a) => a.type === NodeType.BlockExpression) as
      | BlockExpressionNode
      | undefined;

    const children = blockArg ? symbolsFromCommands(blockArg.body) : undefined;

    symbols.push({
      name: commandLabel(c),
      kind: commandKind(c),
      range: locToRange(c.loc),
      selectionRange: selectionRange(c),
      children: children?.length ? children : undefined,
    });
  }

  return symbols;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getDocumentSymbols(script: string): DocumentSymbol[] {
  let ast: EvmlAST;
  try {
    const result = parseScript(script);
    ast = result.ast;
  } catch {
    return [];
  }

  return symbolsFromCommands(ast.body);
}

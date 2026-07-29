import type {
  ArrayExpressionNode,
  CommandExpressionNode,
  HelperFunctionNode,
  Node,
  Position,
} from "@evmcrispr/sdk";
import { NodeType, parseImportList } from "@evmcrispr/sdk";
import { parseScript } from "./parsers/script";

// ---------------------------------------------------------------------------
// F2 rename support for imported names
//
// A `load` import list is the single source of truth for every unqualified
// module name in a script, so renaming an imported command or helper is a
// purely syntactic operation: rewrite the import-list entry (adding or
// updating its `>` rename) and every unqualified usage. Qualified usages
// (`mod:name`, `@mod:name`) always use the module's local export name and
// are deliberately left untouched.
// ---------------------------------------------------------------------------

export interface RenameEdit {
  /** 1-indexed line. */
  line: number;
  /** 0-indexed, inclusive start column. */
  startCol: number;
  /** 0-indexed, exclusive end column. */
  endCol: number;
  newText: string;
}

export interface RenameRange {
  line: number;
  startCol: number;
  endCol: number;
  text: string;
}

export type RenameResult = { edits: RenameEdit[] } | { error: string };

const COMMAND_NAME_RE = /^[a-zA-Z-]{1,63}$/;
const HELPER_NAME_RE = /^(?!-|\.)[a-zA-Z0-9_\-.]+$/;

interface ImportEntryTarget {
  kind: "command" | "helper";
  sourceName: string;
  boundName: string;
  /** The import-list element node (its loc spans the whole entry text). */
  entryNode: Node;
}

interface ScriptIndex {
  commands: CommandExpressionNode[];
  /** All import entries across every load line. */
  entries: ImportEntryTarget[];
  /** Import-list element nodes, so usage scans can skip them. */
  listElements: Set<Node>;
}

function indexScript(script: string): ScriptIndex | undefined {
  let commands: CommandExpressionNode[];
  try {
    commands = parseScript(script).ast.getAllCommandsUntilLine(
      Number.POSITIVE_INFINITY,
    );
  } catch {
    return undefined;
  }

  const entries: ImportEntryTarget[] = [];
  const listElements = new Set<Node>();

  for (const c of commands) {
    if ((c.module ?? "std") !== "std" || c.name !== "load") continue;
    const listNode = c.args[1];
    if (listNode?.type !== NodeType.ArrayExpression) continue;
    for (const el of (listNode as ArrayExpressionNode).elements) {
      listElements.add(el);
    }
    const parsed = parseImportList(listNode as ArrayExpressionNode);
    for (const entry of parsed.entries) {
      entries.push({
        kind: entry.kind,
        sourceName: entry.sourceName,
        boundName: entry.boundName,
        entryNode: entry.node,
      });
    }
  }

  return { commands, entries, listElements };
}

function within(node: Node, line: number, col: number): boolean {
  const loc = node.loc;
  if (!loc) return false;
  if (line !== loc.start.line || line !== loc.end.line) {
    return (
      (line > loc.start.line && line < loc.end.line) ||
      (line === loc.start.line && col >= loc.start.col) ||
      (line === loc.end.line && col < loc.end.col)
    );
  }
  return col >= loc.start.col && col < loc.end.col;
}

/** The span of a command node's name token (excludes any `mod:` prefix). */
function commandNameRange(
  c: CommandExpressionNode,
): { line: number; startCol: number; endCol: number } | undefined {
  const loc = c.loc;
  if (!loc) return undefined;
  const startCol = loc.start.col + (c.module ? c.module.length + 1 : 0);
  return {
    line: loc.start.line,
    startCol,
    endCol: startCol + c.name.length,
  };
}

/** The span of a helper node's name token (excludes `@` and any prefix). */
function helperNameRange(
  h: HelperFunctionNode,
): { line: number; startCol: number; endCol: number } | undefined {
  const loc = h.loc;
  if (!loc) return undefined;
  const startCol = loc.start.col + 1 + (h.module ? h.module.length + 1 : 0);
  return {
    line: loc.start.line,
    startCol,
    endCol: startCol + h.name.length,
  };
}

function collectHelperNodes(node: Node, out: HelperFunctionNode[]): void {
  switch (node.type) {
    case NodeType.HelperFunctionExpression: {
      const h = node as HelperFunctionNode;
      out.push(h);
      for (const a of h.args) collectHelperNodes(a, out);
      break;
    }
    case NodeType.ArrayExpression:
      for (const el of (node as ArrayExpressionNode).elements) {
        collectHelperNodes(el, out);
      }
      break;
    case NodeType.CallExpression: {
      const call = node as any;
      collectHelperNodes(call.target, out);
      for (const a of call.args) collectHelperNodes(a, out);
      break;
    }
    default:
      break;
  }
}

interface ResolvedTarget {
  entry: ImportEntryTarget;
  /** Span of the token under the cursor (usage name or list entry). */
  tokenRange: { line: number; startCol: number; endCol: number };
}

/** Find the import entry the cursor addresses: either the entry itself in a
 *  load import list, or an unqualified usage of its bound name. */
function resolveTarget(
  index: ScriptIndex,
  position: Position,
): ResolvedTarget | undefined {
  const { line, col } = position;

  for (const entry of index.entries) {
    if (within(entry.entryNode, line, col)) {
      const loc = entry.entryNode.loc!;
      return {
        entry,
        tokenRange: {
          line: loc.start.line,
          startCol: loc.start.col,
          endCol: loc.end.col,
        },
      };
    }
  }

  const byCommand = new Map(
    index.entries
      .filter((e) => e.kind === "command")
      .map((e) => [e.boundName, e]),
  );
  const byHelper = new Map(
    index.entries
      .filter((e) => e.kind === "helper")
      .map((e) => [e.boundName, e]),
  );

  for (const c of index.commands) {
    if (!c.module && byCommand.has(c.name)) {
      const r = commandNameRange(c);
      if (r && line === r.line && col >= r.startCol && col < r.endCol) {
        return { entry: byCommand.get(c.name)!, tokenRange: r };
      }
    }
    const helpers: HelperFunctionNode[] = [];
    for (const arg of c.args) {
      if (arg.type === NodeType.BlockExpression) continue;
      collectHelperNodes(arg, helpers);
    }
    for (const opt of c.opts) collectHelperNodes(opt.value, helpers);
    for (const h of helpers) {
      if (h.module || index.listElements.has(h)) continue;
      if (!byHelper.has(h.name)) continue;
      const r = helperNameRange(h);
      if (r && line === r.line && col >= r.startCol && col < r.endCol) {
        return { entry: byHelper.get(h.name)!, tokenRange: r };
      }
    }
  }

  return undefined;
}

/** Range/text of the renameable token at `position`, or null when the
 *  position doesn't address an imported name. Backs Monaco's
 *  `resolveRenameLocation` so F2 rejects non-renameable tokens up front. */
export function prepareRename(
  script: string,
  position: Position,
): RenameRange | null {
  const index = indexScript(script);
  if (!index) return null;
  const target = resolveTarget(index, position);
  if (!target) return null;
  return { ...target.tokenRange, text: target.entry.boundName };
}

export function getRenameEdits(
  script: string,
  position: Position,
  newName: string,
): RenameResult {
  const index = indexScript(script);
  if (!index) return { error: "script does not parse" };

  const resolved = resolveTarget(index, position);
  if (!resolved) {
    return {
      error:
        "Only names bound by a load import list can be renamed (module export names are fixed).",
    };
  }
  const target = resolved.entry;

  const cleanName = newName.startsWith("@") ? newName.slice(1) : newName;
  const nameRe = target.kind === "command" ? COMMAND_NAME_RE : HELPER_NAME_RE;
  if (!nameRe.test(cleanName) || cleanName.endsWith("-")) {
    return {
      error:
        target.kind === "command"
          ? `"${newName}" is not a valid command name (letters and dashes only).`
          : `"${newName}" is not a valid helper name (letters, digits, ".", "_" and dashes).`,
    };
  }
  const collides = index.entries.some(
    (e) => e !== target && e.kind === target.kind && e.boundName === cleanName,
  );
  if (collides) {
    return { error: `"${cleanName}" is already bound by another import.` };
  }

  const edits: RenameEdit[] = [];

  // 1. Rewrite the import-list entry.
  const entryLoc = target.entryNode.loc;
  if (!entryLoc) return { error: "import entry has no location" };
  const entryText =
    target.kind === "command"
      ? cleanName === target.sourceName
        ? target.sourceName
        : `${target.sourceName}>${cleanName}`
      : cleanName === target.sourceName
        ? `@${target.sourceName}`
        : `@${target.sourceName}>@${cleanName}`;
  edits.push({
    line: entryLoc.start.line,
    startCol: entryLoc.start.col,
    endCol: entryLoc.end.col,
    newText: entryText,
  });

  // 2. Rewrite every unqualified usage of the bound name.
  for (const c of index.commands) {
    if (target.kind === "command" && !c.module && c.name === target.boundName) {
      const r = commandNameRange(c);
      if (r) {
        edits.push({
          line: r.line,
          startCol: r.startCol,
          endCol: r.endCol,
          newText: cleanName,
        });
      }
    }
    if (target.kind === "helper") {
      const helpers: HelperFunctionNode[] = [];
      for (const arg of c.args) {
        if (arg.type === NodeType.BlockExpression) continue;
        collectHelperNodes(arg, helpers);
      }
      for (const opt of c.opts) collectHelperNodes(opt.value, helpers);
      for (const h of helpers) {
        if (h.module || index.listElements.has(h)) continue;
        if (h.name !== target.boundName) continue;
        const r = helperNameRange(h);
        if (r) {
          edits.push({
            line: r.line,
            startCol: r.startCol,
            endCol: r.endCol,
            newText: cleanName,
          });
        }
      }
    }
  }

  return { edits };
}

import type {
  ArrayExpressionNode,
  CommandExpressionNode,
  HelperFunctionNode,
  ModuleData,
  Node,
} from "@evmcrispr/sdk";
import { NodeType, parseImportList } from "@evmcrispr/sdk";
import { parseScript } from "./parsers/script";
import type { RenameEdit } from "./rename";

// ---------------------------------------------------------------------------
// Auto-import normalization
//
// Writing a qualified name (`ens:renew`, `@ens:addr`) normalizes to its
// unqualified spelling and records the name in the module's load import
// list — the same convenience as TypeScript auto-imports, built on the
// invariant that the import list is the single source of truth for every
// unqualified module name.
//
// Safety rules — a rewrite only happens when it cannot change meaning:
// - the qualified name must reference a real export of a known module;
// - when the unqualified spelling is taken (another import, a `def`, or a
//   same-kind std export it would shadow), the import is renamed to
//   name + PascalCase(module): `act` → `act>actAragonos`, `@projectAddr`
//   → `@projectAddr>@projectAddrGiveth`; if even that is taken, the token
//   stays qualified;
// - when an import for that export already exists (possibly renamed), the
//   token rewrites to its bound name and the list is left alone.
//
// Beyond token rewrites, each import list is kept as a mirror of usage
// (regardless of `regions`):
// - entries whose bound name is no longer used anywhere are removed;
// - a bare unqualified name that exactly one loaded module exports (and
//   that nothing else binds) re-enters that module's list — so deleting a
//   usage and retyping/pasting it round-trips;
// - whenever a list changes, it is rewritten sorted: commands first, then
//   helpers, each alphabetically. Untouched lists keep their spelling.
// ---------------------------------------------------------------------------

/** 1-indexed lines, 0-indexed cols, end-inclusive on touch. */
export interface NormalizationRegion {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

type ModuleDataLookup = (name: string) => ModuleData | undefined;

interface TokenRange {
  line: number;
  startCol: number;
  endCol: number;
}

interface Candidate {
  kind: "command" | "helper";
  module: string;
  name: string;
  /** Full token span including the `mod:` prefix (and `@` for helpers). */
  token: TokenRange;
}

/** Module names referenced by qualified commands/helpers in the script.
 *  Callers use this to warm their module cache before computing edits. */
export function collectQualifiedModules(script: string): string[] {
  const found = new Set<string>();
  let commands: CommandExpressionNode[];
  try {
    commands = parseScript(script).ast.getAllCommandsUntilLine(
      Number.POSITIVE_INFINITY,
    );
  } catch {
    return [];
  }
  const visitHelpers = (node: Node): void => {
    if (node.type === NodeType.HelperFunctionExpression) {
      const h = node as HelperFunctionNode;
      if (h.module) found.add(h.module);
      for (const a of h.args) visitHelpers(a);
    } else if (node.type === NodeType.ArrayExpression) {
      for (const el of (node as ArrayExpressionNode).elements) {
        visitHelpers(el);
      }
    } else if (node.type === NodeType.CallExpression) {
      const call = node as any;
      visitHelpers(call.target);
      for (const a of call.args) visitHelpers(a);
    } else if (node.type === NodeType.NamedArg) {
      visitHelpers((node as any).value as Node);
    }
  };
  for (const c of commands) {
    if (c.module) found.add(c.module);
    for (const arg of c.args) {
      if (arg.type !== NodeType.BlockExpression) visitHelpers(arg);
    }
    for (const opt of c.opts) visitHelpers(opt.value);
  }
  found.delete("std");
  return [...found];
}

function touches(token: TokenRange, regions: NormalizationRegion[]): boolean {
  return regions.some((r) => {
    if (token.line < r.startLine || token.line > r.endLine) return false;
    const from = token.line === r.startLine ? r.startCol : 0;
    const to = token.line === r.endLine ? r.endCol : Number.POSITIVE_INFINITY;
    return token.startCol <= to && token.endCol >= from;
  });
}

function isLoadCommand(c: CommandExpressionNode): boolean {
  return (c.module ?? "std") === "std" && c.name === "load";
}

function isDefCommand(c: CommandExpressionNode): boolean {
  return (c.module ?? "std") === "std" && c.name === "def";
}

/**
 * Compute the text edits that normalize qualified names written inside
 * `regions` (whole script when omitted) to unqualified spellings backed by
 * load import-list entries. Returns an empty list when there is nothing
 * safe to normalize or the script doesn't parse.
 */
export function getAutoImportEdits(
  script: string,
  moduleData: ModuleDataLookup,
  regions?: NormalizationRegion[],
): RenameEdit[] {
  let commands: CommandExpressionNode[];
  try {
    commands = parseScript(script).ast.getAllCommandsUntilLine(
      Number.POSITIVE_INFINITY,
    );
  } catch {
    return [];
  }

  // ---- current bindings: imports (per load line), defs -------------------
  interface LoadInfo {
    node: CommandExpressionNode;
    /** Span of the `[...]` list. An empty `[]` parses as a destructure
     *  pattern, not an array — both count as a present list. */
    listLoc?: Node["loc"];
    entries: {
      kind: "command" | "helper";
      sourceName: string;
      boundName: string;
    }[];
  }
  const loads = new Map<string, LoadInfo>();
  const defCommands = new Set<string>();
  const defHelpers = new Set<string>();
  const importListNodes = new Set<Node>();

  for (const c of commands) {
    if (isLoadCommand(c)) {
      const moduleName = c.args[0]?.value as string | undefined;
      if (!moduleName) continue;
      const listArg = c.args[1];
      const listNode =
        listArg?.type === NodeType.ArrayExpression
          ? (listArg as ArrayExpressionNode)
          : undefined;
      if (listNode) importListNodes.add(listNode);
      const listLoc =
        listNode?.loc ??
        (listArg?.type === NodeType.DestructurePattern
          ? listArg.loc
          : undefined);
      const entries = listNode ? parseImportList(listNode).entries : [];
      loads.set(moduleName, { node: c, listLoc, entries });
    } else if (isDefCommand(c)) {
      const nameNode = c.args[0];
      if (nameNode?.type === NodeType.Bareword) {
        defCommands.add(nameNode.value as string);
      } else if (nameNode?.type === NodeType.HelperFunctionExpression) {
        defHelpers.add((nameNode as HelperFunctionNode).name);
      }
    }
  }

  // ---- unqualified usages (what the import lists must keep supporting) ----
  const usedCommands = new Set<string>();
  const usedHelpers = new Set<string>();

  const collectHelperUsages = (node: Node): void => {
    if (importListNodes.has(node)) return;
    if (node.type === NodeType.HelperFunctionExpression) {
      const h = node as HelperFunctionNode;
      if (!h.module) usedHelpers.add(h.name);
      for (const a of h.args) collectHelperUsages(a);
    } else if (node.type === NodeType.ArrayExpression) {
      for (const el of (node as ArrayExpressionNode).elements) {
        collectHelperUsages(el);
      }
    } else if (node.type === NodeType.CallExpression) {
      const call = node as any;
      collectHelperUsages(call.target);
      for (const a of call.args) collectHelperUsages(a);
    } else if (node.type === NodeType.NamedArg) {
      collectHelperUsages((node as any).value as Node);
    }
  };

  for (const c of commands) {
    if (!c.module) usedCommands.add(c.name);
    for (const arg of c.args) {
      if (arg.type !== NodeType.BlockExpression) collectHelperUsages(arg);
    }
    for (const opt of c.opts) collectHelperUsages(opt.value);
  }

  const boundNameTaken = (
    kind: "command" | "helper",
    name: string,
  ): boolean => {
    for (const info of loads.values()) {
      if (info.entries.some((e) => e.kind === kind && e.boundName === name)) {
        return true;
      }
    }
    return kind === "command" ? defCommands.has(name) : defHelpers.has(name);
  };

  const existingImport = (
    kind: "command" | "helper",
    module: string,
    sourceName: string,
  ): string | undefined =>
    loads
      .get(module)
      ?.entries.find((e) => e.kind === kind && e.sourceName === sourceName)
      ?.boundName;

  // ---- candidate qualified tokens ----------------------------------------
  const candidates: Candidate[] = [];

  const addHelperCandidates = (node: Node): void => {
    if (importListNodes.has(node)) return;
    if (node.type === NodeType.HelperFunctionExpression) {
      const h = node as HelperFunctionNode;
      if (h.module && h.loc) {
        candidates.push({
          kind: "helper",
          module: h.module,
          name: h.name,
          token: {
            line: h.loc.start.line,
            startCol: h.loc.start.col,
            endCol: h.loc.start.col + 1 + h.module.length + 1 + h.name.length,
          },
        });
      }
      for (const a of h.args) addHelperCandidates(a);
    } else if (node.type === NodeType.ArrayExpression) {
      for (const el of (node as ArrayExpressionNode).elements) {
        addHelperCandidates(el);
      }
    } else if (node.type === NodeType.CallExpression) {
      const call = node as any;
      addHelperCandidates(call.target);
      for (const a of call.args) addHelperCandidates(a);
    } else if (node.type === NodeType.NamedArg) {
      addHelperCandidates((node as any).value as Node);
    }
  };

  for (const c of commands) {
    if (c.module && c.loc) {
      candidates.push({
        kind: "command",
        module: c.module,
        name: c.name,
        token: {
          line: c.loc.start.line,
          startCol: c.loc.start.col,
          endCol: c.loc.start.col + c.module.length + 1 + c.name.length,
        },
      });
    }
    for (const arg of c.args) {
      if (arg.type !== NodeType.BlockExpression) addHelperCandidates(arg);
    }
    for (const opt of c.opts) addHelperCandidates(opt.value);
  }

  // ---- decide rewrites -----------------------------------------------------
  interface ListEntry {
    kind: "command" | "helper";
    sourceName: string;
    boundName: string;
  }
  const edits: RenameEdit[] = [];
  /** module → import-list entries to merge in. */
  const additions = new Map<string, ListEntry[]>();
  /** Bound names claimed by additions queued in this pass, per kind. */
  const queuedBound = { command: new Set<string>(), helper: new Set<string>() };
  /** module → source name → bound name queued in this pass (for dedupe). */
  const queuedByModule = new Map<string, Map<string, string>>();

  /** `aragonos` → `Aragonos`, `access-control` → `AccessControl`. */
  const pascalModule = (m: string): string =>
    m
      .split("-")
      .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
      .join("");

  const stdHas = (kind: "command" | "helper", name: string): boolean => {
    const std = moduleData("std");
    return kind === "command"
      ? !!std?.commands[name]
      : !!std?.helpers[name] || std?.constants?.[name] !== undefined;
  };

  /** A bound name is free when nothing else means it: no import, no def,
   *  no same-kind std export it would shadow, nothing queued this pass. */
  const isFree = (kind: "command" | "helper", name: string): boolean =>
    !boundNameTaken(kind, name) &&
    !stdHas(kind, name) &&
    !queuedBound[kind].has(name);

  for (const cand of candidates) {
    if (regions && !touches(cand.token, regions)) continue;

    // std: strip the redundant prefix when the bare name still means std.
    if (cand.module === "std") {
      if (!stdHas(cand.kind, cand.name)) continue;
      if (boundNameTaken(cand.kind, cand.name)) continue;
      edits.push({
        line: cand.token.line,
        startCol: cand.token.startCol,
        endCol: cand.token.endCol,
        newText: cand.kind === "helper" ? `@${cand.name}` : cand.name,
      });
      continue;
    }

    const data = moduleData(cand.module);
    if (!data) continue;
    const exists =
      cand.kind === "command"
        ? !!data.commands[cand.name]
        : !!data.helpers[cand.name] ||
          data.constants?.[cand.name] !== undefined;
    if (!exists) continue;

    // Already imported (possibly renamed): rewrite to the bound name.
    const existing = existingImport(cand.kind, cand.module, cand.name);
    const queuedForSource = queuedByModule.get(cand.module)?.get(cand.name);
    const bound = existing ?? queuedForSource;
    if (bound) {
      edits.push({
        line: cand.token.line,
        startCol: cand.token.startCol,
        endCol: cand.token.endCol,
        newText: cand.kind === "helper" ? `@${bound}` : bound,
      });
      // The rewritten token is a usage of the bound name — the prune pass
      // below must see the script as it stands after these edits.
      (cand.kind === "helper" ? usedHelpers : usedCommands).add(bound);
      continue;
    }

    // Pick the bound name: the export's own name when free; otherwise
    // rename it to name + PascalCase(module) — `act` taken (by std, an
    // import, or a `def`) becomes `act>actAragonos`. When even that is
    // taken, keep the token qualified.
    let boundName = cand.name;
    if (!isFree(cand.kind, boundName)) {
      const fallback = `${cand.name}${pascalModule(cand.module)}`;
      if (!isFree(cand.kind, fallback)) continue;
      boundName = fallback;
    }

    edits.push({
      line: cand.token.line,
      startCol: cand.token.startCol,
      endCol: cand.token.endCol,
      newText: cand.kind === "helper" ? `@${boundName}` : boundName,
    });
    (cand.kind === "helper" ? usedHelpers : usedCommands).add(boundName);

    const queued = additions.get(cand.module) ?? [];
    queued.push({ kind: cand.kind, sourceName: cand.name, boundName });
    additions.set(cand.module, queued);
    queuedBound[cand.kind].add(boundName);
    const perModule = queuedByModule.get(cand.module) ?? new Map();
    perModule.set(cand.name, boundName);
    queuedByModule.set(cand.module, perModule);
  }

  // ---- re-imports for bare unqualified usages ------------------------------
  // Deleting a usage prunes its list entry (below); typing or pasting the
  // bare name again must restore it. Any used unqualified name that nothing
  // binds (std, an import, a `def`, or an addition queued above) and that
  // exactly one loaded module exports re-enters that module's list.
  const loadedExporters = (
    kind: "command" | "helper",
    name: string,
  ): string[] =>
    [...loads.keys()].filter((m) => {
      const d = moduleData(m);
      return kind === "command"
        ? !!d?.commands[name]
        : !!d?.helpers[name] || d?.constants?.[name] !== undefined;
    });

  for (const kind of ["command", "helper"] as const) {
    const used = kind === "command" ? usedCommands : usedHelpers;
    for (const name of used) {
      if (
        stdHas(kind, name) ||
        boundNameTaken(kind, name) ||
        queuedBound[kind].has(name)
      ) {
        continue;
      }
      const exporters = loadedExporters(kind, name);
      if (exporters.length !== 1) continue;
      const queued = additions.get(exporters[0]) ?? [];
      queued.push({ kind, sourceName: name, boundName: name });
      additions.set(exporters[0], queued);
      queuedBound[kind].add(name);
    }
  }

  // ---- import-list edits ----------------------------------------------------
  // Each list mirrors usage: entries whose bound name is no longer used are
  // dropped, queued additions are merged in, and a changed list is rewritten
  // sorted — commands first, then helpers, each alphabetically. Lists whose
  // membership didn't change keep their spelling untouched.
  let lastTopLevelLoadLine = 0;
  for (const c of commands) {
    if (isLoadCommand(c) && c.loc) {
      lastTopLevelLoadLine = Math.max(lastTopLevelLoadLine, c.loc.end.line);
    }
  }

  const entryText = (e: ListEntry): string => {
    const rename = e.boundName !== e.sourceName;
    return e.kind === "command"
      ? rename
        ? `${e.sourceName}>${e.boundName}`
        : e.sourceName
      : rename
        ? `@${e.sourceName}>@${e.boundName}`
        : `@${e.sourceName}`;
  };
  const byKindThenName = (a: ListEntry, b: ListEntry): number =>
    a.kind !== b.kind
      ? a.kind === "command"
        ? -1
        : 1
      : a.sourceName.localeCompare(b.sourceName) ||
        a.boundName.localeCompare(b.boundName);

  for (const module of new Set([...loads.keys(), ...additions.keys()])) {
    const info = loads.get(module);
    const adds = additions.get(module) ?? [];
    const kept = (info?.entries ?? []).filter((e) =>
      (e.kind === "command" ? usedCommands : usedHelpers).has(e.boundName),
    );
    const removed = (info?.entries.length ?? 0) - kept.length;
    if (!adds.length && removed === 0) continue;

    const joined = [...kept, ...adds]
      .sort(byKindThenName)
      .map(entryText)
      .join(" ");

    if (!info) {
      // No load line at all: create one after the last load (or at the top).
      const line = lastTopLevelLoadLine + 1;
      edits.push({
        line,
        startCol: 0,
        endCol: 0,
        newText: `load ${module} [${joined}]\n`,
      });
      continue;
    }
    const listLoc = info.listLoc;
    if (listLoc && listLoc.start.line === listLoc.end.line) {
      if (joined) {
        edits.push({
          line: listLoc.start.line,
          startCol: listLoc.start.col,
          endCol: listLoc.end.col,
          newText: `[${joined}]`,
        });
      } else {
        // Nothing left: drop the list with its preceding whitespace.
        const lineText = script.split("\n")[listLoc.start.line - 1] ?? "";
        let startCol = listLoc.start.col;
        while (startCol > 0 && /\s/.test(lineText[startCol - 1])) startCol--;
        edits.push({
          line: listLoc.start.line,
          startCol,
          endCol: listLoc.end.col,
          newText: "",
        });
      }
    } else if (!listLoc && info.node.loc && joined) {
      const end = info.node.loc.end;
      edits.push({
        line: end.line,
        startCol: end.col,
        endCol: end.col,
        newText: ` [${joined}]`,
      });
    }
    // Multi-line lists are left untouched (edits are single-line).
  }

  return edits;
}

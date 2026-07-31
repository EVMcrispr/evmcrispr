import type {
  Address,
  ArgDef,
  CommandExpressionNode,
  HelperArgDefEntry,
  HelperFunctionNode,
  ICommand,
  ModuleBinding,
  Node,
  NoNullableBinding,
  Position,
} from "@evmcrispr/sdk";
import {
  BindingsManager,
  BindingsSpace,
  NodeType,
  parseConfigVarName,
  resolveArgDefIndex,
  resolveCommand,
} from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { isAddress } from "viem";

import type { EvmlAST } from "../EvmlAST";
import { createInterpreter, type InterpretCtx } from "../interpreter";
import { parseScript } from "../parsers/script";
import { collectScriptImports, type VariableHistory } from "../scriptWalk";
import { getAddressHoverInfo } from "./address";
import { getTokenAtCol } from "./tokens";
import type { HoverInfo, HoverRef } from "./types";

const { MODULE, USER } = BindingsSpace;

export { clearAddressHoverCache, getAddressHoverInfo } from "./address";
export type { HoverInfo, HoverRef } from "./types";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface HoverContext {
  moduleCache: BindingsManager;
  /** USER bindings produced by the latest `EvmlWorkspace.prewarm(script)` call.
   *  Holds the *final* value of each variable (after every `set` in the
   *  script). Used as a fallback when no `variableHistory` is supplied. */
  scriptBindings?: BindingsManager;
  /** Per-variable `(line, value)` history from the latest prewarm. When
   *  present, hover uses it to look up `$x` as it stood at the cursor's
   *  line, so a redefinition `set $x 1; set $x 2` shows `1` on line 1
   *  and `2` on line 2 instead of the final value everywhere. */
  variableHistory?: VariableHistory;
  /** Active viem PublicClient — required for address hover details. */
  client?: PublicClient;
  /** Current chain id — used to fetch verified-contract data per chain. */
  chainId?: number;
}

/**
 * Build a USER-only `BindingsManager` snapshot reflecting each variable's
 * value as of the largest history entry with `line <= position.line`.
 *
 * Falls back to `scriptBindings` when no history is available so direct
 * callers (and pre-existing tests) keep working.
 */
function bindingsAsOf(
  history: VariableHistory | undefined,
  scriptBindings: BindingsManager | undefined,
  line: number,
): BindingsManager | undefined {
  if (!history) return scriptBindings;
  const snapshot = new BindingsManager();
  for (const [name, entries] of history) {
    let chosen: { line: number; value: unknown } | undefined;
    for (const entry of entries) {
      if (entry.line <= line) chosen = entry;
      else break;
    }
    if (chosen !== undefined) {
      snapshot.setBinding(
        name,
        chosen.value as any,
        USER,
        false,
        undefined,
        true,
      );
    }
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// Module cache lookups
// ---------------------------------------------------------------------------

function _getAllModules(moduleCache: BindingsManager) {
  return moduleCache.getAllBindings({
    spaceFilters: [MODULE],
    ignoreNullValues: true,
  }) as NoNullableBinding<ModuleBinding>[];
}

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

/** Split a spelled helper token (`ens:addr` or `addr`) into module + name. */
function splitHelperToken(spelled: string): {
  module?: string;
  name: string;
} {
  const m = /^(?:([\w-]+):)?(.+)$/.exec(spelled);
  if (!m) return { name: spelled };
  return { module: m[1], name: m[2] };
}

/** Resolve a spelled helper name the way the runtime does: qualified module
 *  → the script's import list → std prelude. */
function findHelperInCache(
  spelled: string,
  moduleCache: BindingsManager,
  imports: Map<string, { module: string; name: string }>,
): {
  argDefs?: HelperArgDefEntry[];
  returnType?: string | string[];
  description?: string;
  moduleName: string;
} | null {
  const { module, name } = splitHelperToken(spelled);
  let owner = module ?? "std";
  let localName = name;
  if (!module) {
    const imported = imports.get(`@${name}`);
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
    moduleName: owner,
  };
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
    const typeLabel = Array.isArray(a.type) ? a.type.join(" | ") : a.type;
    const label = `${a.name}: ${typeLabel}${a.rest ? "..." : ""}`;
    parts.push(a.optional || a.rest ? `[${label}]` : `<${label}>`);
  }

  for (const o of command.optDefs) {
    const typeLabel = Array.isArray(o.type) ? o.type.join(" | ") : o.type;
    parts.push(`[--${o.name} ${typeLabel}]`);
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
  returnType: string | string[] | undefined,
  description: string | undefined,
): string {
  const params = argDefs
    ? argDefs
        .map((a) => {
          const suffix = a.rest ? "..." : "";
          const opt = a.optional ? "?" : "";
          const typeLabel = Array.isArray(a.type) ? a.type.join(" | ") : a.type;
          return `${a.name}${opt}: ${typeLabel}${suffix}`;
        })
        .join(", ")
    : "";
  const retLabel = Array.isArray(returnType)
    ? returnType.join(" | ")
    : returnType;
  const ret = retLabel ? ` → ${retLabel}` : "";
  let result = `\`\`\`\n@${helperName}(${params})${ret}\n\`\`\``;
  if (description) {
    result += `\n${description}`;
  }
  return result;
}

/** Shared panel shape for option/parameter cards: a bold kind label plus
 *  `name: type` and the owning command/helper as the title line,
 *  description as the body — mirrors the `**Variable**`/`**Config**`
 *  panel style. */
function formatDefHover(
  kind: "Option" | "Parameter",
  name: string,
  type: string | string[],
  ownerLabel: string,
  description: string | undefined,
): string {
  const typeLabel = Array.isArray(type) ? type.join(" | ") : type;
  let result = `**${kind}** \`${name}: ${typeLabel}\` of \`${ownerLabel}\``;
  if (description) {
    result += `\n\n${description}`;
  }
  return result;
}

function commandLabel(commandNode: CommandExpressionNode): string {
  return `${commandNode.module ? `${commandNode.module}:` : ""}${commandNode.name}`;
}

/**
 * When the hovered token is a positional argument of a command, resolve
 * which arg definition it fills so the hover can describe the parameter
 * (name, type, description) alongside the token's own card.
 */
async function findCommandArgDefAtPosition(
  script: string,
  position: Position,
  moduleCache: BindingsManager,
  matchesNode: (node: Node) => boolean,
): Promise<{ commandNode: CommandExpressionNode; argDef: ArgDef } | null> {
  let ast: EvmlAST;
  try {
    ast = parseScript(script).ast;
  } catch {
    return null;
  }

  const commandNode = ast.getCommandAtLine(position.line);
  if (!commandNode) return null;

  // Only direct positional args count: a variable nested inside a helper
  // call fills the helper's parameter, not the command's.
  const argIndex = commandNode.args.findIndex(
    (a) => matchesNode(a) && isInside(a, position.line, position.col),
  );
  if (argIndex === -1) return null;

  const resolved = await resolveCommandFromCache(
    commandNode.name,
    commandNode.module,
    moduleCache,
    collectScriptImports(script),
  );
  if (!resolved?.command.argDefs) return null;

  const defIdx = resolveArgDefIndex(
    resolved.command.argDefs,
    commandNode.args,
    argIndex,
  );
  if (defIdx < 0) return null;

  return { commandNode, argDef: resolved.command.argDefs[defIdx] };
}

// ---------------------------------------------------------------------------
// Position helpers
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

function isInside(node: Node, line: number, col: number): boolean {
  const loc = node.loc;
  if (!loc) return false;
  if (line < loc.start.line || line > loc.end.line) return false;
  if (line === loc.start.line && col < loc.start.col) return false;
  if (line === loc.end.line && col > loc.end.col) return false;
  return true;
}

/**
 * Walk the AST looking for the deepest helper-function node whose location
 * encloses the cursor. Used to identify helpers that we want to evaluate
 * for the address hover card.
 */
function findHelperAtPosition(
  ast: EvmlAST,
  line: number,
  col: number,
): HelperFunctionNode | null {
  let found: HelperFunctionNode | null = null;

  const visit = (node: Node): void => {
    if (!isInside(node, line, col)) return;

    if (node.type === NodeType.HelperFunctionExpression) {
      found = node as HelperFunctionNode;
    }

    const children: Node[] = [];
    if ("args" in node && Array.isArray((node as any).args)) {
      children.push(...(node as any).args);
    }
    if ("body" in node && Array.isArray((node as any).body)) {
      children.push(...(node as any).body);
    }
    if (node.type === NodeType.NamedArg) {
      children.push((node as any).value as Node);
    }

    for (const c of children) visit(c);
  };

  for (const cmd of ast.body) visit(cmd);
  return found;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function getHoverInfo(
  script: string,
  position: Position,
  ctx: HoverContext,
): Promise<HoverInfo | null> {
  const { moduleCache } = ctx;
  const scriptLines = script.split("\n");
  const lineText = scriptLines[position.line - 1];
  if (!lineText) return null;

  // Position-aware view of USER bindings: each variable resolves to its
  // value as of the most recent `set` at-or-before the hover line. This
  // also flows into the helper interpreter (via `tryRenderAddressFromCache`)
  // so cache lookups for `@helper($x)` use the right key for that line.
  const positionBindings = bindingsAsOf(
    ctx.variableHistory,
    ctx.scriptBindings,
    position.line,
  );

  const token = getTokenAtCol(lineText, position.col);
  if (!token) return null;

  // --- address: 0x… ---
  if (token.kind === "address") {
    return getAddressHoverInfo(token.value as Address, ctx.client, ctx.chainId);
  }

  // --- helper: @name / @module:name ---
  if (token.kind === "helper") {
    const spelled = token.value.slice(1);
    const info = findHelperInCache(
      spelled,
      moduleCache,
      collectScriptImports(script),
    );
    if (!info) return null;

    const baseContents = formatHelperHover(
      spelled,
      info.argDefs,
      info.returnType,
      info.description,
    );

    const returnsAddress = Array.isArray(info.returnType)
      ? info.returnType.includes("address")
      : info.returnType === "address";

    const { name: helperName } = splitHelperToken(spelled);
    const ref: HoverRef = {
      kind: "helper",
      name: helperName,
      module: info.moduleName,
    };

    if (returnsAddress && ctx.chainId != null) {
      let ast: EvmlAST;
      try {
        ast = parseScript(script).ast;
      } catch {
        return { contents: [baseContents], ref };
      }

      const { module, name } = splitHelperToken(spelled);
      const helperNode = findHelperAtPosition(ast, position.line, position.col);
      if (
        helperNode &&
        helperNode.name === name &&
        helperNode.module === module
      ) {
        const addressCard = await tryRenderAddressFromCache(
          helperNode,
          ctx,
          positionBindings,
        );
        if (addressCard && addressCard.length > 0) {
          return { contents: [baseContents, ...addressCard], ref };
        }
      }
    }

    return { contents: [baseContents], ref };
  }

  // --- variable: $name ---
  if (token.kind === "variable") {
    // Config variables ($mod:key): render the declaration card.
    const cfg = parseConfigVarName(token.value);
    if (cfg) {
      const moduleData = moduleCache.getBindingValue(cfg.module, MODULE);
      const def = moduleData?.configs?.find(
        (d: { name: string }) => d.name === cfg.key,
      );
      if (def) {
        const type = Array.isArray(def.type) ? def.type.join(" | ") : def.type;
        const current = (
          positionBindings ?? ctx.scriptBindings
        )?.getBindingValue(token.value, USER);
        const sections = [
          `**Config** \`${token.value}: ${type}\``,
          def.description,
        ];
        if (current != null) {
          sections.push(
            `Current: ${formatVariableValue(current, scriptLines) ?? String(current)}`,
          );
        } else if (def.default !== undefined) {
          sections.push(`Default: \`${def.default}\``);
        }
        return { contents: sections };
      }
      // Unknown/undeclared config var — fall through to the plain-variable
      // rendering (diagnostics already flag it).
    }

    // Variable bindings are keyed with the `$` prefix in the BindingsManager
    // (matches what `set` writes and what the unified interpreter reads).
    // Use the position-aware snapshot when available so a redefinition like
    // `set $x 1; set $x 2` shows `1` on line 1 and `2` on line 2.
    const value = (positionBindings ?? ctx.scriptBindings)?.getBindingValue(
      token.value,
      USER,
    );
    const formatted = formatVariableValue(value, scriptLines);

    // Commands like `contracts:deploy`, `new-dao`, `new-token`, `install`, `sign`
    // and `for` produce a runtime value the prewarm walker can't
    // predict; it seeds the binding with the variable's own name as a
    // placeholder so subsequent hovers know the symbol is defined.
    // Treat that as "no resolvable value yet" rather than rendering
    // `**Variable** $voting = $voting`.
    const isPlaceholder = formatted === token.value;

    // Single-line card: `**Variable** $name = value`. The address
    // card, if any, is appended as a separate section so the renderer
    // draws the green divider between the two — no need for a verbose
    // "(variable)" tag or "(defined on line N)" hint.
    const labelCard =
      formatted != null && !isPlaceholder
        ? `**Variable** ${token.value} = ${formatted}`
        : `**Variable** ${token.value}`;
    const sections: string[] = [labelCard];

    // If the variable fills a command's positional argument (e.g.
    // `verify $contract`), describe that parameter too.
    const argCtx = await findCommandArgDefAtPosition(
      script,
      position,
      moduleCache,
      (n) => n.type === NodeType.VariableIdentifier,
    );
    if (argCtx) {
      sections.push(
        formatDefHover(
          "Parameter",
          argCtx.argDef.name,
          argCtx.argDef.type,
          commandLabel(argCtx.commandNode),
          argCtx.argDef.description,
        ),
      );
    }

    if (typeof value === "string" && isAddress(value) && ctx.chainId != null) {
      const info = await getAddressHoverInfo(
        value as Address,
        ctx.client,
        ctx.chainId,
      );
      if (info && info.contents.length > 0) {
        sections.push(...info.contents);
      }
    }

    return { contents: sections };
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
      collectScriptImports(script),
    );
    if (!resolved) return null;

    const optName = token.value.slice(2);
    const optDef = resolved.command.optDefs.find((o) => o.name === optName);
    if (!optDef) return null;

    return {
      contents: [
        formatDefHover(
          "Option",
          `--${optDef.name}`,
          optDef.type,
          commandLabel(commandNode),
          optDef.description,
        ),
      ],
    };
  }

  // --- named arg: `name:` inside a helper call ---
  // The tokenizer can't distinguish a named-arg name from a `mod:command`
  // head, so confirm via the AST: the enclosing helper must actually carry
  // a NamedArg with this name at the position. Unconfirmed tokens fall
  // through to the command-name handling below.
  if (token.kind === "named-arg") {
    let namedAst: EvmlAST | undefined;
    try {
      namedAst = parseScript(script).ast;
    } catch {
      /* fall through */
    }
    if (namedAst) {
      const helperNode = findHelperAtPosition(
        namedAst,
        position.line,
        position.col,
      );
      const namedNode = helperNode?.args.find(
        (a) =>
          a.type === NodeType.NamedArg &&
          (a as unknown as { name: string }).name === token.value &&
          isInside(a, position.line, position.col),
      );
      if (helperNode && namedNode) {
        const spelled = helperNode.module
          ? `${helperNode.module}:${helperNode.name}`
          : helperNode.name;
        const info = findHelperInCache(
          spelled,
          moduleCache,
          collectScriptImports(script),
        );
        const def = info?.argDefs?.find((d) => d.name === token.value);
        if (def) {
          return {
            contents: [
              formatDefHover(
                "Parameter",
                def.name,
                def.type,
                `@${spelled}`,
                def.description,
              ),
            ],
          };
        }
        return null;
      }
    }
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
      collectScriptImports(script),
    );
    if (!resolved) return null;
    return {
      contents: [
        formatCommandHover(
          commandNode.name,
          commandNode.module,
          resolved.command,
        ),
      ],
      ref: {
        kind: "command",
        name: commandNode.name,
        module: resolved.resolvedModule,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Variable value formatting
// ---------------------------------------------------------------------------

const MAX_VALUE_LENGTH = 120;

/**
 * Render a USER-binding value for display in the variable hover card.
 * Returns `null` if there is nothing meaningful to show (undefined / null /
 * an unresolved AST node — those happen when the walker couldn't resolve
 * the right-hand side of a `set`).
 */
function formatVariableValue(
  value: unknown,
  scriptLines?: string[],
): string | null {
  if (value == null) return null;

  if (isAstNode(value)) {
    const rendered = renderAstNode(value, scriptLines);
    return rendered == null ? null : truncate(rendered);
  }

  if (typeof value === "string") {
    return truncate(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  // Num and other objects with a useful toString.
  if (typeof value === "object" && value !== null) {
    const proto = Object.getPrototypeOf(value);
    if (
      typeof (value as { toString?: () => string }).toString === "function" &&
      proto?.toString !== Object.prototype.toString
    ) {
      return truncate((value as { toString: () => string }).toString());
    }
    try {
      return truncate(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  return null;
}

interface AstLike {
  type?: string;
  value?: unknown;
  power?: number;
  timeUnit?: string;
  perTime?: boolean;
  heredoc?: string;
  args?: unknown[];
  elements?: unknown[];
  module?: string;
  name?: string;
  loc?: {
    start: { line: number; col: number };
    end: { line: number; col: number };
  };
}

function isAstNode(value: unknown): value is AstLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in (value as object) &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

/**
 * Render an AST literal/expression node as the user originally wrote it.
 * Used as a best-effort fallback when the walker stored the raw node
 * (e.g. for `set $x 1 ether`, or for any non-evaluatable RHS).
 *
 * When `scriptLines` is provided and the node has a single-line `loc`,
 * we slice the original source instead of reconstructing it. That
 * preserves the user's exact formatting — important for helpers like
 * `@num(1 + 4)` whose space-separated args would otherwise be rendered
 * as `@num(1, +, 4)`.
 */
function renderAstNode(node: AstLike, scriptLines?: string[]): string | null {
  const fromSource = sliceFromSource(node, scriptLines);
  if (fromSource != null) return fromSource;

  switch (node.type) {
    case NodeType.StringLiteral: {
      if (typeof node.value !== "string") return null;
      // Render heredoc blocks compactly instead of dumping the content.
      if (node.heredoc) {
        const lines = node.value === "" ? 0 : node.value.split("\n").length;
        return `<<<${node.heredoc} (${lines} line${lines === 1 ? "" : "s"})`;
      }
      // Preserve quoting so the displayed value is unambiguous.
      return JSON.stringify(node.value);
    }

    case NodeType.AddressLiteral:
    case NodeType.BytesLiteral:
    case NodeType.Bareword:
    case NodeType.BoolLiteral:
      return node.value == null ? null : String(node.value);

    case NodeType.NumberLiteral: {
      if (node.value == null) return null;
      const base = String(node.value);
      const power = node.power ? `e${node.power}` : "";
      const unit = node.timeUnit
        ? node.perTime
          ? `/${node.timeUnit}`
          : ` ${node.timeUnit}`
        : "";
      return `${base}${power}${unit}`;
    }

    case NodeType.ArrayExpression: {
      const elements = node.elements ?? [];
      const rendered = elements.map((c) => renderAstChild(c, scriptLines));
      return `[${rendered.join(", ")}]`;
    }

    case NodeType.HelperFunctionExpression: {
      const args = node.args ?? [];
      const rendered = args.map((c) => renderAstChild(c, scriptLines));
      const prefix = node.module ? `${node.module}:` : "";
      return `@${prefix}${node.name ?? ""}(${rendered.join(", ")})`;
    }

    case NodeType.VariableIdentifier:
      return typeof node.value === "string" ? node.value : null;

    case NodeType.NamedArg: {
      const child = renderAstChild(
        (node as AstLike & { value: unknown }).value,
        scriptLines,
      );
      return `${(node as unknown as { name: string }).name}:${child}`;
    }

    default:
      return null;
  }
}

function renderAstChild(child: unknown, scriptLines?: string[]): string {
  if (isAstNode(child)) {
    return renderAstNode(child, scriptLines) ?? "?";
  }
  if (typeof child === "string") return JSON.stringify(child);
  if (
    typeof child === "number" ||
    typeof child === "boolean" ||
    typeof child === "bigint"
  ) {
    return String(child);
  }
  return "?";
}

/**
 * Slice the original script text covered by `node.loc`. Returns `null`
 * when we don't have lines, the loc is missing, or the node spans
 * multiple lines (in which case the AST-based rendering is more
 * compact for the hover card).
 */
function sliceFromSource(
  node: AstLike,
  scriptLines: string[] | undefined,
): string | null {
  if (!scriptLines || !node.loc) return null;
  const { start, end } = node.loc;
  if (start.line !== end.line) return null;
  const line = scriptLines[start.line - 1];
  if (line == null) return null;
  if (start.col < 0 || end.col > line.length || end.col < start.col) {
    return null;
  }
  const slice = line.slice(start.col, end.col);
  return slice.length === 0 ? null : slice;
}

function truncate(s: string): string {
  return s.length > MAX_VALUE_LENGTH
    ? `${s.slice(0, MAX_VALUE_LENGTH - 1)}…`
    : s;
}

// ---------------------------------------------------------------------------
// Helper-result address card
// ---------------------------------------------------------------------------

/**
 * Look up the value previously computed for this helper call by the
 * autocompletion walk and, if it is an address, render the hover card.
 *
 * Uses the unified interpreter in `read-only cache` mode: the helper
 * resolver always returns `undefined` (no RPC), so the only way the
 * interpreter can produce a value is by hitting the prewarm-populated
 * CACHE space with the same key the writer uses. This guarantees
 * writer/reader cannot drift.
 */
async function tryRenderAddressFromCache(
  node: HelperFunctionNode,
  ctx: HoverContext,
  positionBindings: BindingsManager | undefined,
): Promise<string[] | null> {
  if (ctx.chainId == null) return null;

  // Interpret with USER bindings (so `@whatever($var)` resolves variables)
  // but route any cache miss to "no value" — never trigger an RPC from hover.
  // Prefer the position-aware snapshot so the cache key matches the value
  // the walker wrote when it visited the helper at this line.
  const bindings =
    positionBindings ?? ctx.scriptBindings ?? new BindingsManager();
  const interpretCtx: InterpretCtx = {
    bindings,
    chainId: ctx.chainId,
    client: undefined,
    helperCache: ctx.moduleCache,
    onError: "undefined",
    resolveHelper: async () => undefined,
  };
  const { interpretNode } = createInterpreter(interpretCtx);
  const cached = await interpretNode(node);
  if (typeof cached !== "string" || !isAddress(cached)) return null;

  const info = await getAddressHoverInfo(
    cached as Address,
    ctx.client,
    ctx.chainId,
  );
  return info?.contents ?? null;
}

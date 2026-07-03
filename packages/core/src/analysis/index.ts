import type {
  ArgDef,
  ArgType,
  BindingsManager,
  BlockExpressionNode,
  CallExpressionNode,
  CommandExpressionNode,
  DestructurePatternNode,
  DestructureSlot,
  HelperFunctionNode,
  ICommand,
  Node,
} from "@evmcrispr/sdk";
import {
  buildArgsLengthErrorMsg,
  computeCommandArity,
  isSpecialArgType,
  NodeType,
  validateArgType,
} from "@evmcrispr/sdk";

import type { ParseDiagnostic } from "../diagnostics";
import { parseScript } from "../parsers/script";
import { ModuleSchemaProvider } from "./moduleSchemas";

/** Literal builtin scalar types we can validate statically against a literal
 *  argument node with high confidence (value == runtime value). */
const CHECKABLE_LITERAL_TYPES = new Set(["address", "number", "bool"]);

const LITERAL_NODE_TYPES = new Set<NodeType>([
  NodeType.AddressLiteral,
  NodeType.NumberLiteral,
  NodeType.BoolLiteral,
  NodeType.StringLiteral,
  NodeType.BytesLiteral,
  NodeType.Bareword,
]);

function diag(
  node: Node,
  message: string,
  code: string,
  severity: "error" | "warning" = "error",
): ParseDiagnostic {
  const loc = node.loc;
  return {
    line: loc?.start.line ?? 1,
    col: loc?.start.col ?? 0,
    endLine: loc?.end.line,
    endCol: loc?.end.col,
    message,
    severity,
    code,
    source: "semantic",
  };
}

/** Levenshtein distance, capped for short identifiers. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  return dp[n];
}

/** Closest candidate to `word` within a small edit distance, or undefined. */
function suggest(
  word: string,
  candidates: Iterable<string>,
): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  const max = Math.max(2, Math.floor(word.length / 3));
  for (const c of candidates) {
    const d = levenshtein(word, c);
    if (d < bestDist && d <= max) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function didYouMean(word: string, candidates: Iterable<string>): string {
  const s = suggest(word, candidates);
  return s ? ` Did you mean "${s}"?` : "";
}

/** All variable names used inside an argument expression (descends into
 *  arrays, helpers and calls). Definition-position nodes are handled by the
 *  caller, not here. */
function collectVariableUses(node: Node, out: string[]): void {
  switch (node.type) {
    case NodeType.VariableIdentifier:
      out.push(node.value as string);
      break;
    case NodeType.ArrayExpression:
      for (const el of (node as any).elements as Node[]) {
        collectVariableUses(el, out);
      }
      break;
    case NodeType.HelperFunctionExpression:
      for (const a of (node as HelperFunctionNode).args) {
        collectVariableUses(a, out);
      }
      break;
    case NodeType.CallExpression: {
      const call = node as CallExpressionNode;
      collectVariableUses(call.target, out);
      for (const a of call.args) collectVariableUses(a, out);
      break;
    }
    default:
      break;
  }
}

/** Every helper node reachable inside an argument expression. */
function collectHelpers(node: Node, out: HelperFunctionNode[]): void {
  switch (node.type) {
    case NodeType.HelperFunctionExpression: {
      const h = node as HelperFunctionNode;
      out.push(h);
      for (const a of h.args) collectHelpers(a, out);
      break;
    }
    case NodeType.ArrayExpression:
      for (const el of (node as any).elements as Node[])
        collectHelpers(el, out);
      break;
    case NodeType.CallExpression: {
      const call = node as CallExpressionNode;
      collectHelpers(call.target, out);
      for (const a of call.args) collectHelpers(a, out);
      break;
    }
    default:
      break;
  }
}

/** Every call node reachable inside an argument expression. */
function collectCalls(node: Node, out: CallExpressionNode[]): void {
  switch (node.type) {
    case NodeType.CallExpression: {
      const call = node as CallExpressionNode;
      out.push(call);
      collectCalls(call.target, out);
      for (const a of call.args) collectCalls(a, out);
      break;
    }
    case NodeType.HelperFunctionExpression:
      for (const a of (node as HelperFunctionNode).args) collectCalls(a, out);
      break;
    case NodeType.ArrayExpression:
      for (const el of (node as any).elements as Node[]) collectCalls(el, out);
      break;
    default:
      break;
  }
}

function slotNames(slots: DestructureSlot[], out: string[]): void {
  for (const s of slots) {
    if (typeof s === "string") out.push(s);
    else if (Array.isArray(s)) slotNames(s, out);
  }
}

/** Whether a return-destructure tree contains a `$` capture marker. */
function hasCaptureMarker(slots: DestructureSlot[]): boolean {
  for (const s of slots) {
    if (s === "$") return true;
    if (Array.isArray(s) && hasCaptureMarker(s)) return true;
  }
  return false;
}

function isDefCommand(c: CommandExpressionNode): boolean {
  return (c.module ?? "std") === "std" && c.name === "def";
}

function isVariableDef(type: ArgType): boolean {
  return Array.isArray(type) ? type.includes("variable") : type === "variable";
}

interface AnalyzerMeta {
  /** script alias -> real module name (from `load x --as y`). */
  aliases: Map<string, string>;
  /** user command names defined via `def`. */
  defCommands: Set<string>;
  /** user helper names (without `@`) defined via `def`. */
  defHelpers: Set<string>;
  /** every variable name defined anywhere in the script. */
  everDefined: Set<string>;
}

class SemanticAnalyzer {
  #schemas: ModuleSchemaProvider;
  #diagnostics: ParseDiagnostic[] = [];
  /** Variables defined earlier in document order (monotonic — never popped,
   *  so cross-scope references stay lenient). */
  #definedSoFar = new Set<string>();
  #meta: AnalyzerMeta = {
    aliases: new Map(),
    defCommands: new Set(),
    defHelpers: new Set(),
    everDefined: new Set(),
  };

  constructor(schemas: ModuleSchemaProvider) {
    this.#schemas = schemas;
  }

  /** Translate a module reference (possibly an alias) to its real name. */
  #realModule(name: string | undefined): string | undefined {
    if (!name) return undefined;
    return this.#meta.aliases.get(name) ?? name;
  }

  async analyze(body: CommandExpressionNode[]): Promise<ParseDiagnostic[]> {
    await this.#collectMeta(body);
    await this.#check(body, "std", []);
    this.#diagnostics.sort((a, b) => a.line - b.line || a.col - b.col);
    return this.#diagnostics;
  }

  // --- Pass 1: metadata (aliases, def names, all variable definitions) -----

  async #collectMeta(
    body: CommandExpressionNode[],
    parentModule = "std",
  ): Promise<void> {
    for (const c of body) {
      // Record `load x --as y` aliases.
      if ((c.module ?? "std") === "std" && c.name === "load") {
        const real = c.args[0]?.value as string | undefined;
        const asOpt = c.opts.find((o) => o.name === "as");
        const alias = asOpt?.value?.value as string | undefined;
        if (real && alias) this.#meta.aliases.set(alias, real);
      }

      // Record `def` command / helper names.
      if (isDefCommand(c)) {
        const nameNode = c.args[0];
        if (nameNode?.type === NodeType.Bareword) {
          this.#meta.defCommands.add(nameNode.value as string);
        } else if (nameNode?.type === NodeType.HelperFunctionExpression) {
          this.#meta.defHelpers.add((nameNode as HelperFunctionNode).name);
        }
        continue; // don't descend into def bodies
      }

      // Variable definitions from capture clauses.
      this.#collectCaptureDefs(c, this.#meta.everDefined);

      // Variable definitions from variable-typed argDefs.
      const cmd = await this.#resolveCommand(c, parentModule);
      if (cmd) this.#collectVariableDefs(c, cmd, this.#meta.everDefined);

      // Recurse into block bodies with the block's owning module in scope.
      for (const blk of this.#blocks(c)) {
        await this.#collectMeta(blk.body, c.module ?? parentModule);
      }
    }
  }

  #collectCaptureDefs(c: CommandExpressionNode, into: Set<string>): void {
    for (const cap of [
      ...(c.eventCaptures ?? []),
      ...(c.errorCaptures ?? []),
    ]) {
      const names: string[] = [];
      slotNames(cap.captures, names);
      for (const n of names) into.add(`$${n}`);
      if ("boolVar" in cap && cap.boolVar) into.add(`$${cap.boolVar}`);
    }
  }

  #collectVariableDefs(
    c: CommandExpressionNode,
    cmd: ICommand,
    into: Set<string>,
  ): void {
    for (let i = 0; i < cmd.argDefs.length; i++) {
      if (!isVariableDef(cmd.argDefs[i].type)) continue;
      const node = c.args[i];
      if (!node) continue;
      if (node.type === NodeType.VariableIdentifier) {
        into.add(node.value as string);
      } else if (node.type === NodeType.DestructurePattern) {
        const names: string[] = [];
        slotNames((node as DestructurePatternNode).slots, names);
        for (const n of names) into.add(n);
      }
    }
  }

  // --- Pass 2: emit diagnostics -------------------------------------------

  async #check(
    body: CommandExpressionNode[],
    parentModule: string,
    batchStack: string[],
  ): Promise<void> {
    for (const c of body) {
      // def bodies are opaque to the checker (params may be $vars or
      // @helpers we can't see) — validate the def command shape only.
      if (isDefCommand(c)) continue;

      await this.#checkCommand(c, parentModule, batchStack);
    }
  }

  async #checkCommand(
    c: CommandExpressionNode,
    parentModule: string,
    batchStack: string[],
  ): Promise<void> {
    const realModule = this.#realModule(c.module ?? parentModule) ?? "std";
    const isDef = this.#meta.defCommands.has(c.name) && !c.module;

    // 0. `load <module>` target must be a registered module.
    if ((c.module ?? "std") === "std" && c.name === "load") {
      const target = c.args[0];
      const name = target?.value as string | undefined;
      if (
        target?.type === NodeType.Bareword &&
        name &&
        !this.#schemas.isRegistered(name) &&
        !this.#schemas.isLoaded(name)
      ) {
        this.#diagnostics.push(
          diag(
            target,
            `Module "${name}" is not registered.${didYouMean(
              name,
              this.#schemas.registeredNames(),
            )}`,
            "unknown-module",
          ),
        );
      }
    }

    // 1. Module resolution diagnostics (module-prefixed commands).
    if (c.module) {
      const real = this.#realModule(c.module)!;
      if (!this.#schemas.isLoaded(real)) {
        if (this.#schemas.isRegistered(real)) {
          this.#diagnostics.push(
            diag(
              c,
              `Module "${real}" is registered but not loaded. Add "load ${real}" before this line.`,
              "module-not-loaded",
            ),
          );
        } else {
          this.#diagnostics.push(
            diag(
              c,
              `Module "${c.module}" is not registered.${didYouMean(
                c.module,
                this.#schemas.registeredNames(),
              )}`,
              "unknown-module",
            ),
          );
        }
        return;
      }
    }

    const cmd = await this.#resolveCommand(c, parentModule);

    // 2. Unknown command (only when the owning module is loaded).
    if (!cmd && !isDef) {
      if (this.#schemas.isLoaded(realModule)) {
        const known = this.#schemas.commandNames(realModule);
        this.#diagnostics.push(
          diag(
            c,
            `Command "${this.#displayName(c)}" does not exist${
              realModule === "std" ? "" : ` on module "${realModule}"`
            }.${didYouMean(c.name, known)}`,
            "unknown-command",
          ),
        );
      }
      // Still check helpers / variables inside its args below.
    }

    // 3-6. Schema-driven checks for resolved commands.
    if (cmd) {
      this.#checkArity(c, cmd);
      this.#checkOptions(c, cmd);
      this.#checkLiteralTypes(c, cmd);
      if (batchStack.length > 0) this.#checkBatchable(c, cmd, batchStack);
      this.#checkVariableUses(c, cmd);
    }

    // 7. Helpers anywhere in the args (module-agnostic resolution).
    await this.#checkHelpers(c, batchStack);

    // 8. Return-capture markers in nested calls.
    this.#checkReturnCaptures(c);

    // Record this command's own definitions so later commands (and its own
    // block body) see them.
    this.#recordDefs(c, cmd);

    // Recurse into blocks, tracking batch context.
    const opensBatch = !!cmd?.createsBatchContext;
    for (const blk of this.#blocks(c)) {
      const nextStack = opensBatch
        ? [...batchStack, this.#batchName(c)]
        : batchStack;
      await this.#check(blk.body, c.module ?? parentModule, nextStack);
    }
  }

  #checkArity(c: CommandExpressionNode, cmd: ICommand): void {
    const arity = computeCommandArity(cmd.argDefs, c.args);
    if (arity.missingBlockName) {
      this.#diagnostics.push(
        diag(
          c,
          `"${c.name}" requires a ( ... ) block for <${arity.missingBlockName}>.`,
          "missing-block",
        ),
      );
      return;
    }
    if (arity.isError) {
      this.#diagnostics.push(
        diag(
          c,
          `"${c.name}": ${buildArgsLengthErrorMsg(
            arity.effectiveArgCount,
            arity.comparison,
          )}`,
          "arg-count",
        ),
      );
    }
  }

  #checkOptions(c: CommandExpressionNode, cmd: ICommand): void {
    const valid = new Set(cmd.optDefs.map((o) => o.name));
    const seen = new Set<string>();
    for (const opt of c.opts) {
      if (!valid.has(opt.name)) {
        this.#diagnostics.push(
          diag(
            opt,
            `Unknown option --${opt.name} for "${c.name}".${
              valid.size
                ? ` Valid options: ${[...valid].map((o) => `--${o}`).join(", ")}`
                : " This command takes no options."
            }`,
            "unknown-option",
          ),
        );
      } else if (seen.has(opt.name)) {
        this.#diagnostics.push(
          diag(
            opt,
            `Duplicate option --${opt.name}.`,
            "duplicate-option",
            "warning",
          ),
        );
      }
      seen.add(opt.name);
    }
  }

  #checkLiteralTypes(c: CommandExpressionNode, cmd: ICommand): void {
    const customTypes = this.#schemas.customTypes();
    // Only walk the leading run of plain (non-optional, non-rest,
    // non-special) argDefs so direct index alignment is guaranteed.
    for (let i = 0; i < cmd.argDefs.length; i++) {
      const def = cmd.argDefs[i];
      if (def.optional || def.rest || isSpecialArgType(def.type)) break;
      if (Array.isArray(def.type) || !CHECKABLE_LITERAL_TYPES.has(def.type)) {
        continue;
      }
      const node = c.args[i];
      if (!node || !LITERAL_NODE_TYPES.has(node.type)) continue;
      const value = node.value;
      const formatted = `<${def.name}>`;
      try {
        validateArgType(formatted, value, def.type, customTypes);
      } catch (e: any) {
        this.#diagnostics.push(diag(node, e.message, "literal-type-mismatch"));
      }
    }
  }

  #checkBatchable(
    c: CommandExpressionNode,
    cmd: ICommand,
    batchStack: string[],
  ): void {
    if (cmd.batchable === false) {
      this.#diagnostics.push(
        diag(
          c,
          `"${c.name}" cannot be used inside ${batchStack[batchStack.length - 1]}.`,
          "not-batchable",
        ),
      );
    }
  }

  #checkVariableUses(c: CommandExpressionNode, cmd: ICommand): void {
    const defPositions = new Set<number>();
    for (let i = 0; i < cmd.argDefs.length; i++) {
      if (isVariableDef(cmd.argDefs[i].type)) defPositions.add(i);
    }
    const uses: string[] = [];
    for (let i = 0; i < c.args.length; i++) {
      if (defPositions.has(i)) continue;
      const node = c.args[i];
      if (node.type === NodeType.BlockExpression) continue;
      collectVariableUses(node, uses);
    }
    for (const opt of c.opts) collectVariableUses(opt.value, uses);
    for (const name of uses) this.#checkVariableName(name, c);
  }

  #checkVariableName(name: string, at: Node): void {
    // Skip module config vars ($mod:foo) and non-`$` internals.
    if (!name.startsWith("$") || name.includes(":")) return;
    if (this.#definedSoFar.has(name)) return;
    if (this.#meta.everDefined.has(name)) {
      // Defined later or in a sibling/inner scope — likely a use-before-set,
      // but scope subtleties make it uncertain, so warn rather than error.
      this.#diagnostics.push(
        diag(
          at,
          `Variable ${name} is used before it is defined.`,
          "undefined-variable",
          "warning",
        ),
      );
      return;
    }
    this.#diagnostics.push(
      diag(at, `Variable ${name} is not defined.`, "undefined-variable"),
    );
  }

  /** Add a command's variable + capture definitions to `definedSoFar`. */
  #recordDefs(c: CommandExpressionNode, cmd: ICommand | undefined): void {
    this.#collectCaptureDefs(c, this.#definedSoFar);
    if (cmd) this.#collectVariableDefs(c, cmd, this.#definedSoFar);
  }

  async #checkHelpers(
    c: CommandExpressionNode,
    batchStack: string[],
  ): Promise<void> {
    const helpers: HelperFunctionNode[] = [];
    for (const arg of c.args) collectHelpers(arg, helpers);
    for (const opt of c.opts) collectHelpers(opt.value, helpers);

    for (const h of helpers) {
      if (this.#meta.defHelpers.has(h.name)) continue;
      if (!this.#schemas.hasHelper(h.name)) {
        this.#diagnostics.push(
          diag(
            h,
            `Helper @${h.name} does not exist on any loaded module.`,
            "unknown-helper",
          ),
        );
        continue;
      }
      // Helper arity, from statically-stored arg defs.
      const argDefs = this.#schemas.getHelperArgDefs(h.name);
      if (argDefs) {
        const arity = computeCommandArity(argDefs as ArgDef[], h.args);
        if (arity.isError) {
          this.#diagnostics.push(
            diag(
              h,
              `@${h.name}: ${buildArgsLengthErrorMsg(
                arity.effectiveArgCount,
                arity.comparison,
              )}`,
              "arg-count",
            ),
          );
        }
      }
      // Non-batchable helper inside a batch context.
      if (batchStack.length > 0) {
        const batchable = await this.#schemas.getHelperBatchable(h.name);
        if (batchable === false) {
          this.#diagnostics.push(
            diag(
              h,
              `Helper @${h.name} reads on-chain state and cannot be used inside ${
                batchStack[batchStack.length - 1]
              }; read it into a variable with \`set\` first.`,
              "not-batchable",
            ),
          );
        }
      }
    }
  }

  #checkReturnCaptures(c: CommandExpressionNode): void {
    const calls: CallExpressionNode[] = [];
    for (const arg of c.args) collectCalls(arg, calls);
    for (const opt of c.opts) collectCalls(opt.value, calls);
    for (const call of calls) {
      if (call.returnDestructure && !hasCaptureMarker(call.returnDestructure)) {
        this.#diagnostics.push(
          diag(
            call,
            "Return destructure has no $ capture marker (use $ to mark which value to keep).",
            "return-capture-marker",
          ),
        );
      }
    }
  }

  // --- Shared helpers ------------------------------------------------------

  #blocks(c: CommandExpressionNode): BlockExpressionNode[] {
    return c.args.filter(
      (a) => a.type === NodeType.BlockExpression,
    ) as BlockExpressionNode[];
  }

  #batchName(c: CommandExpressionNode): string {
    return this.#displayName(c);
  }

  #displayName(c: CommandExpressionNode): string {
    return c.module ? `${c.module}:${c.name}` : c.name;
  }

  #resolveCommand(
    c: CommandExpressionNode,
    parentModule: string,
  ): Promise<ICommand | undefined> {
    const real = this.#realModule(c.module ?? parentModule) ?? "std";
    return this.#schemas.getCommand(real, c.name);
  }
}

/**
 * Static semantic diagnostics for an EVML script: unknown modules / commands /
 * helpers, wrong argument counts, unknown options, undefined variables,
 * literal type mismatches, batch-context misuse and malformed return captures.
 *
 * Fully offline (module schemas come from `moduleCache`, resolved via local
 * dynamic imports) and never throws — parse errors are surfaced separately by
 * `getDiagnostics`.
 */
export async function getSemanticDiagnostics(
  script: string,
  moduleCache: BindingsManager,
  registeredModuleNames: string[],
): Promise<ParseDiagnostic[]> {
  let body: CommandExpressionNode[];
  try {
    body = parseScript(script).ast.body;
  } catch {
    return [];
  }
  try {
    const schemas = new ModuleSchemaProvider(
      moduleCache,
      registeredModuleNames,
    );
    return await new SemanticAnalyzer(schemas).analyze(body);
  } catch {
    return [];
  }
}

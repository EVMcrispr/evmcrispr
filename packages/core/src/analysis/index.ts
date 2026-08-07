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
  ModuleData,
  Node,
} from "@evmcrispr/sdk";
import {
  buildArgsLengthErrorMsg,
  computeCommandArity,
  experimentalDisabledMessage,
  isExperimentalEnabled,
  isSpecialArgType,
  NodeType,
  parseConfigVarName,
  parseImportList,
  parseSignature,
  partitionHelperArgs,
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

/** Diagnostic for a registered-but-hidden experimental module. Used instead
 *  of "unknown-module" so no `didYouMean` suggests the hidden name. */
function experimentalModuleDiag(name: string, node: Node): ParseDiagnostic {
  return diag(
    node,
    experimentalDisabledMessage("module", name),
    "experimental-disabled",
  );
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
    case NodeType.NamedArg:
      collectVariableUses((node as any).value as Node, out);
      break;
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
    case NodeType.NamedArg:
      collectHelpers((node as any).value as Node, out);
      break;
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
    case NodeType.NamedArg:
      collectCalls((node as any).value as Node, out);
      break;
    default:
      break;
  }
}

/** Every bareword node reachable inside an argument expression. */
function collectBarewords(node: Node, out: Node[]): void {
  switch (node.type) {
    case NodeType.Bareword:
      out.push(node);
      break;
    case NodeType.ArrayExpression:
      for (const el of (node as any).elements as Node[])
        collectBarewords(el, out);
      break;
    case NodeType.HelperFunctionExpression:
      for (const a of (node as HelperFunctionNode).args)
        collectBarewords(a, out);
      break;
    case NodeType.CallExpression: {
      const call = node as CallExpressionNode;
      collectBarewords(call.target, out);
      for (const a of call.args) collectBarewords(a, out);
      break;
    }
    case NodeType.NamedArg:
      collectBarewords((node as any).value as Node, out);
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

function isLoadCommand(c: CommandExpressionNode): boolean {
  return (c.module ?? "std") === "std" && c.name === "load";
}

/** `def module <name> ( ...defs )` — an inline EVML module definition. */
function isModuleDef(c: CommandExpressionNode): boolean {
  return (
    isDefCommand(c) &&
    c.args[0]?.type === NodeType.Bareword &&
    c.args[0].value === "module"
  );
}

/** `def return` — early exit from a def command body. */
function isReturnDef(c: CommandExpressionNode): boolean {
  return (
    isDefCommand(c) &&
    c.args[0]?.type === NodeType.Bareword &&
    c.args[0].value === "return"
  );
}

function isLoopCommand(c: CommandExpressionNode): boolean {
  return (c.module ?? "std") === "std" && c.name === "loop";
}

/** The loop connector keyword (`of` / `until` / `break` / `continue`),
 *  read from the first bareword among the leading args. */
function loopConnector(c: CommandExpressionNode): string | undefined {
  for (const a of c.args.slice(0, 2)) {
    if (a.type === NodeType.Bareword) return a.value as string;
  }
  return undefined;
}

function getFromOpt(c: CommandExpressionNode): Node | undefined {
  return c.opts.find((o) => o.name === "from")?.value;
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

const MODULE_NAME_RE = /^[a-zA-Z][a-zA-Z-]{0,62}$/;
const IPFS_FROM_RE = /^ipfs:\/\/[a-zA-Z0-9]+$/;

/** Barebones ICommand for a def inside a `module` block: enough for arity,
 *  option and literal-type checks of `alias:cmd` call sites. */
function defToCommandSchema(sig: string): ICommand | undefined {
  try {
    const { params, opts } = parseSignature(sig);
    return { run: async () => [], argDefs: params, optDefs: opts };
  } catch {
    return undefined;
  }
}

/** Synthesize a ModuleData schema from an inline `module` block's defs so
 *  qualified calls (`alias:cmd`, `@alias:helper`) validate like any loaded
 *  module. Best-effort: malformed defs are skipped (they get their own
 *  diagnostics in the check pass). Also used by the Workspace to seed the
 *  editor cache for inline and external EVML modules. */
export function synthesizeModuleData(block: BlockExpressionNode): ModuleData {
  const data: ModuleData = {
    commands: {},
    helpers: {},
    helperReturnTypes: {},
    helperHasArgs: {},
    helperArgDefs: {},
    synthetic: true,
  };
  for (const node of block.body) {
    if (!isDefCommand(node)) continue;
    const nameNode = node.args[0];
    const sigNode = node.args[1];
    const sig =
      sigNode?.type === NodeType.StringLiteral ? String(sigNode.value) : "";
    if (nameNode?.type === NodeType.Bareword) {
      if (nameNode.value === "return") continue; // `def return` is control flow
      const cmd = defToCommandSchema(sig);
      if (cmd) data.commands[nameNode.value as string] = cmd;
    } else if (nameNode?.type === NodeType.HelperFunctionExpression) {
      const name = (nameNode as HelperFunctionNode).name;
      try {
        const { params, returnType } = parseSignature(sig);
        data.helpers[name] = (async () => undefined) as any;
        if (returnType) data.helperReturnTypes![name] = returnType;
        data.helperHasArgs![name] = params.length > 0;
        data.helperArgDefs![name] = params.map((p) => ({
          name: p.name,
          type: p.type,
          ...(p.optional ? { optional: true } : {}),
          ...(p.rest ? { rest: true } : {}),
        }));
      } catch {
        // Malformed signature — diagnosed in the check pass.
      }
    }
  }
  return data;
}

function isVariableDef(type: ArgType): boolean {
  return Array.isArray(type) ? type.includes("variable") : type === "variable";
}

interface ImportRef {
  module: string;
  /** The export's local name on the module (before any `>` rename). */
  sourceName: string;
}

interface AnalyzerMeta {
  /** bound name -> module command import (from `load m [cmd cmd>bound]`). */
  importedCommands: Map<string, ImportRef>;
  /** bound name (without `@`) -> module helper/constant import. */
  importedHelpers: Map<string, ImportRef>;
  /** user command names defined via `def`. */
  defCommands: Set<string>;
  /** user helper names (without `@`) defined via `def`. */
  defHelpers: Set<string>;
  /** every variable name defined anywhere in the script. */
  everDefined: Set<string>;
  /** inline `module` names seen (for duplicate detection). */
  inlineModules: Set<string>;
  /** inline module names that collide with an already-loaded schema. */
  collidingModules: Set<string>;
}

class SemanticAnalyzer {
  #schemas: ModuleSchemaProvider;
  #diagnostics: ParseDiagnostic[] = [];
  /** Variables defined earlier in document order (monotonic — never popped,
   *  so cross-scope references stay lenient). */
  #definedSoFar = new Set<string>();
  #meta: AnalyzerMeta = {
    importedCommands: new Map(),
    importedHelpers: new Map(),
    defCommands: new Set(),
    defHelpers: new Set(),
    everDefined: new Set(),
    inlineModules: new Set(),
    collidingModules: new Set(),
  };

  constructor(schemas: ModuleSchemaProvider) {
    this.#schemas = schemas;
  }

  async analyze(body: CommandExpressionNode[]): Promise<ParseDiagnostic[]> {
    await this.#collectMeta(body);
    await this.#check(body, []);
    await this.#checkControlFlow(body, { loopDepth: 0, inDefBody: false });
    this.#diagnostics.sort((a, b) => a.line - b.line || a.col - b.col);
    return this.#diagnostics;
  }

  // --- Pass 1: metadata (imports, def names, all variable definitions) -----

  async #collectMeta(body: CommandExpressionNode[]): Promise<void> {
    for (const c of body) {
      // Inline `def module` blocks: synthesize a schema under the module
      // name so qualified calls validate; don't descend (their defs are
      // module-scoped, not script-level).
      if (isModuleDef(c)) {
        const nameNode = c.args[1];
        const blockNode = c.args.find(
          (a) => a.type === NodeType.BlockExpression,
        ) as BlockExpressionNode | undefined;
        if (nameNode?.type === NodeType.Bareword && blockNode) {
          const name = nameNode.value as string;
          if (this.#meta.inlineModules.has(name)) {
            // duplicate — diagnosed in the check pass
          } else if (
            !this.#schemas.addSyntheticModule(
              name,
              synthesizeModuleData(blockNode),
            )
          ) {
            this.#meta.collidingModules.add(name);
          }
          this.#meta.inlineModules.add(name);
        }
        continue;
      }

      // Record `load m [imports]` bindings (validated in pass 2).
      if (isLoadCommand(c)) {
        // `load name[>alias] --from ipfs://…`: external module — without a
        // fetched schema, register an opaque placeholder so qualified calls
        // don't produce false diagnostics offline.
        const fromVal = getFromOpt(c);
        const targetNode = c.args[0];
        if (fromVal && targetNode?.type === NodeType.Bareword) {
          const target = splitLoadTarget(targetNode.value as string);
          if (target) {
            this.#schemas.addSyntheticModule(target.alias ?? target.canonical, {
              commands: {},
              helpers: {},
              opaque: true,
              synthetic: true,
            });
          }
        }
        const rawTarget = c.args[0]?.value as string | undefined;
        const moduleName = rawTarget
          ? (splitLoadTarget(rawTarget)?.alias ??
            splitLoadTarget(rawTarget)?.canonical ??
            rawTarget)
          : undefined;
        const listNode = c.args[1];
        if (moduleName && listNode?.type === NodeType.ArrayExpression) {
          const { entries } = parseImportList(listNode as any);
          for (const entry of entries) {
            const ref: ImportRef = {
              module: moduleName,
              sourceName: entry.sourceName,
            };
            if (entry.kind === "command") {
              this.#meta.importedCommands.set(entry.boundName, ref);
            } else {
              this.#meta.importedHelpers.set(entry.boundName, ref);
            }
          }
        }
      }

      // Record `def` command / helper names. `def return` is control flow,
      // not a definition — it never binds a name.
      if (isDefCommand(c)) {
        const nameNode = c.args[0];
        if (nameNode?.type === NodeType.Bareword && !isReturnDef(c)) {
          this.#meta.defCommands.add(nameNode.value as string);
        } else if (nameNode?.type === NodeType.HelperFunctionExpression) {
          this.#meta.defHelpers.add((nameNode as HelperFunctionNode).name);
        }
        continue; // don't descend into def bodies
      }

      // Variable definitions from capture clauses.
      this.#collectCaptureDefs(c, this.#meta.everDefined);

      // Variable definitions from variable-typed argDefs.
      const cmd = await this.#resolveCommand(c);
      if (cmd) this.#collectVariableDefs(c, cmd, this.#meta.everDefined);

      // Recurse into block bodies.
      for (const blk of this.#blocks(c)) {
        await this.#collectMeta(blk.body);
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
    for (const cap of c.txCaptures ?? []) {
      into.add(`$${cap.variable}`);
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
    batchStack: string[],
  ): Promise<void> {
    for (const c of body) {
      // `def module` blocks get their own validation (and are NOT recursed
      // into generically — their defs are module-scoped).
      if (isModuleDef(c)) {
        await this.#checkModuleCommand(c);
        continue;
      }

      // def bodies are opaque to the checker (params may be $vars or
      // @helpers we can't see) — validate the def name for import
      // collisions, nothing else. (`def return` placement is validated by
      // the control-flow pass.)
      if (isDefCommand(c)) {
        if (!isReturnDef(c)) this.#checkDefImportCollision(c);
        continue;
      }

      await this.#checkCommand(c, batchStack);
    }
  }

  /** Validate a `def module <name> ( ... )` definition: name rules,
   *  def-only block body and def signatures. */
  async #checkModuleCommand(c: CommandExpressionNode): Promise<void> {
    const cmd = await this.#resolveCommand(c);
    if (cmd) {
      this.#checkArity(c, cmd);
      this.#checkOptions(c, cmd);
    }

    const nameNode = c.args[1];
    if (nameNode?.type !== NodeType.Bareword) return;
    const name = nameNode.value as string;

    if (!MODULE_NAME_RE.test(name) || name.endsWith("-")) {
      this.#diagnostics.push(
        diag(
          nameNode,
          `Invalid module name "${name}" — use letters and dashes, starting with a letter.`,
          "invalid-module-name",
        ),
      );
    } else if (name === "std") {
      this.#diagnostics.push(
        diag(nameNode, `Module name "std" is reserved.`, "invalid-module-name"),
      );
    } else if (this.#meta.collidingModules.has(name)) {
      this.#diagnostics.push(
        diag(
          nameNode,
          `Module name "${name}" collides with a loaded module.`,
          "module-name-collision",
        ),
      );
    } else if (this.#schemas.isRegistered(name)) {
      // Shadowing a registered-but-unloaded module is allowed (forwards
      // compatibility: future built-ins must not break published scripts).
      this.#diagnostics.push(
        diag(
          nameNode,
          `Module "${name}" shadows the registered module of the same name — consider a different name.`,
          "module-shadows-registered",
          "warning",
        ),
      );
    }

    const blockNode = c.args.find((a) => a.type === NodeType.BlockExpression) as
      | BlockExpressionNode
      | undefined;
    if (!blockNode) return;

    const seenDefs = new Set<string>();
    for (const node of blockNode.body) {
      if (!isDefCommand(node)) {
        this.#diagnostics.push(
          diag(
            node,
            `Module blocks may only contain def commands (found "${node.module ? `${node.module}:` : ""}${node.name}").`,
            "module-def-only",
          ),
        );
        continue;
      }
      if (isModuleDef(node)) {
        this.#diagnostics.push(
          diag(
            node,
            `Nested module definitions are not allowed.`,
            "module-def-only",
          ),
        );
        continue;
      }
      const defName = node.args[0];
      const key =
        defName?.type === NodeType.Bareword
          ? (defName.value as string)
          : defName?.type === NodeType.HelperFunctionExpression
            ? `@${(defName as HelperFunctionNode).name}`
            : undefined;
      if (key) {
        if (seenDefs.has(key)) {
          this.#diagnostics.push(
            diag(
              defName as Node,
              `Duplicate def name ${key} in module ${name}.`,
              "duplicate-def",
            ),
          );
        }
        seenDefs.add(key);
      }
      const sigNode = node.args[1];
      if (sigNode?.type === NodeType.StringLiteral) {
        try {
          parseSignature(String(sigNode.value));
        } catch (e: any) {
          this.#diagnostics.push(
            diag(sigNode, e.message, "invalid-def-signature"),
          );
        }
      }
    }
  }

  #checkDefImportCollision(c: CommandExpressionNode): void {
    const nameNode = c.args[0];
    if (nameNode?.type === NodeType.Bareword) {
      const name = nameNode.value as string;
      if (this.#meta.importedCommands.has(name)) {
        this.#diagnostics.push(
          diag(
            nameNode,
            `"${name}" is already bound by a load import list.`,
            "import-collision",
          ),
        );
      }
    } else if (nameNode?.type === NodeType.HelperFunctionExpression) {
      const name = (nameNode as HelperFunctionNode).name;
      if (this.#meta.importedHelpers.has(name)) {
        this.#diagnostics.push(
          diag(
            nameNode,
            `"@${name}" is already bound by a load import list.`,
            "import-collision",
          ),
        );
      }
    }
  }

  /** Validate a load command's import list: shape, unknown exports,
   *  duplicates, and collisions with `def` names. */
  #checkLoadImports(c: CommandExpressionNode): void {
    const rawTarget = c.args[0]?.value as string | undefined;
    const target = rawTarget ? splitLoadTarget(rawTarget) : null;
    const moduleName = target?.alias ?? target?.canonical ?? rawTarget;
    const listNode = c.args[1];
    if (!listNode) return;

    if (listNode.type !== NodeType.ArrayExpression) {
      this.#diagnostics.push(
        diag(
          listNode,
          "Import list must be a literal array (e.g. load ens [renew @addr]).",
          "invalid-import",
        ),
      );
      return;
    }

    const { entries, errors } = parseImportList(listNode as any);
    for (const err of errors) {
      this.#diagnostics.push(diag(err.node, err.message, "invalid-import"));
    }

    const seen = new Set<string>();
    const moduleLoaded =
      !!moduleName &&
      this.#schemas.isLoaded(moduleName) &&
      !this.#schemas.isOpaque(moduleName);

    for (const entry of entries) {
      // Unknown export (only checkable when the module schema is available).
      if (moduleLoaded && moduleName) {
        if (entry.kind === "command") {
          if (!this.#schemas.hasCommand(moduleName, entry.sourceName)) {
            this.#diagnostics.push(
              diag(
                entry.node,
                `Module "${moduleName}" has no command "${entry.sourceName}".${didYouMean(
                  entry.sourceName,
                  this.#schemas.commandNames(moduleName),
                )}`,
                "unknown-import",
              ),
            );
          }
        } else if (
          !this.#schemas.hasHelper(moduleName, entry.sourceName) &&
          !this.#schemas.hasConstant(moduleName, entry.sourceName)
        ) {
          this.#diagnostics.push(
            diag(
              entry.node,
              `Module "${moduleName}" has no helper or constant "@${entry.sourceName}".${didYouMean(
                entry.sourceName,
                this.#schemas.helperNames(moduleName),
              )}`,
              "unknown-import",
            ),
          );
        }
      }

      // Duplicates within this list.
      const key =
        entry.kind === "command" ? entry.boundName : `@${entry.boundName}`;
      if (seen.has(key)) {
        this.#diagnostics.push(
          diag(entry.node, `Duplicate import ${key}.`, "duplicate-import"),
        );
      }
      seen.add(key);

      // Collision with a def-defined name.
      const defSet =
        entry.kind === "command"
          ? this.#meta.defCommands
          : this.#meta.defHelpers;
      if (defSet.has(entry.boundName)) {
        this.#diagnostics.push(
          diag(
            entry.node,
            `Import ${key} collides with a def-defined name.`,
            "import-collision",
          ),
        );
      }
    }
  }

  async #checkCommand(
    c: CommandExpressionNode,
    batchStack: string[],
  ): Promise<void> {
    const isDef = !c.module && this.#meta.defCommands.has(c.name);
    const imported = c.module
      ? undefined
      : this.#meta.importedCommands.get(c.name);
    const owningModule = c.module ?? imported?.module ?? "std";

    this.#checkCaptures(c, owningModule);

    // 0. `load <module>`: target must be registered; import list must be
    //    well-formed and name real exports. With `--from`, the first arg is
    //    a local alias instead — validate the source URL, not the registry.
    if (isLoadCommand(c)) {
      const target = c.args[0];
      const rawName = target?.value as string | undefined;
      const parsedTarget = rawName ? splitLoadTarget(rawName) : null;
      const fromVal = getFromOpt(c);
      if (rawName && !parsedTarget) {
        this.#diagnostics.push(
          diag(
            target,
            `Invalid module name "${rawName}" — expected name or name>alias.`,
            "invalid-module-name",
          ),
        );
      } else if (fromVal) {
        const from =
          fromVal.type === NodeType.Bareword ||
          fromVal.type === NodeType.StringLiteral
            ? String(fromVal.value)
            : undefined;
        if (from !== undefined && !IPFS_FROM_RE.test(from)) {
          this.#diagnostics.push(
            diag(
              fromVal,
              `--from only supports ipfs://<cid> sources.`,
              "invalid-module-source",
            ),
          );
        }
        const local = parsedTarget?.alias ?? parsedTarget?.canonical;
        if (local && this.#schemas.isRegistered(local)) {
          this.#diagnostics.push(
            diag(
              target,
              `"${local}" shadows the registered module of the same name — rename it with ${parsedTarget?.canonical}>alias to keep both available.`,
              "module-shadows-registered",
              "warning",
            ),
          );
        }
      } else if (parsedTarget?.alias !== undefined) {
        this.#diagnostics.push(
          diag(
            target,
            `Module renames (name>alias) are only supported with --from.`,
            "invalid-module-name",
          ),
        );
      } else if (
        target?.type === NodeType.Bareword &&
        rawName &&
        !this.#schemas.isRegistered(rawName) &&
        !this.#schemas.isLoaded(rawName)
      ) {
        this.#diagnostics.push(
          this.#schemas.isExperimentalModule(rawName)
            ? experimentalModuleDiag(rawName, target)
            : diag(
                target,
                `Module "${rawName}" is not registered.${didYouMean(
                  rawName,
                  this.#schemas.registeredNames(),
                )}`,
                "unknown-module",
              ),
        );
      }
      this.#checkLoadImports(c);
    }

    // 1. Module resolution diagnostics (qualified commands and commands
    //    resolving through an import).
    if (owningModule !== "std" && !this.#schemas.isLoaded(owningModule)) {
      if (this.#schemas.isRegistered(owningModule)) {
        this.#diagnostics.push(
          diag(
            c,
            `Module "${owningModule}" is registered but not loaded. Add "load ${owningModule}" before this line.`,
            "module-not-loaded",
          ),
        );
      } else {
        this.#diagnostics.push(
          this.#schemas.isExperimentalModule(owningModule)
            ? experimentalModuleDiag(owningModule, c)
            : diag(
                c,
                `Module "${owningModule}" is not registered.${didYouMean(
                  owningModule,
                  this.#schemas.registeredNames(),
                )}`,
                "unknown-module",
              ),
        );
      }
      return;
    }

    const cmd = await this.#resolveCommand(c);

    // 2. Unknown command (only when the owning module is loaded and not an
    //    opaque external placeholder).
    if (!cmd && !isDef) {
      if (
        this.#schemas.isLoaded(owningModule) &&
        !this.#schemas.isOpaque(owningModule)
      ) {
        const known = [
          ...this.#schemas.commandNames(c.module ?? "std"),
          ...(c.module ? [] : this.#meta.importedCommands.keys()),
        ];
        this.#diagnostics.push(
          this.#schemas.isExperimentalCommand(c.module ?? "std", c.name)
            ? diag(
                c,
                experimentalDisabledMessage("command", c.name),
                "experimental-disabled",
              )
            : diag(
                c,
                `Command "${this.#displayName(c)}" does not exist${
                  c.module ? ` on module "${c.module}"` : ""
                }.${didYouMean(c.name, known)}${
                  c.module
                    ? ""
                    : " Qualify it as <module>:name or add it to the module's load import list."
                }`,
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
      this.#checkConfigDefPositions(c, cmd);
      this.#checkRecordShapes(c, cmd);
    }

    // 7. Helpers anywhere in the args (module-agnostic resolution).
    await this.#checkHelpers(c, batchStack);

    // 7b. Malformed hex/address literals anywhere in the args.
    this.#checkMalformedHexLiterals(c);

    // 7c. Structural named-arg checks (mixed record arrays, named args in
    // inline calls) anywhere in the args/opt values.
    this.#checkNamedArgStructures(c);

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
      await this.#check(blk.body, nextStack);
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
    const experimentalOff = !isExperimentalEnabled();
    const seen = new Set<string>();
    for (const opt of c.opts) {
      if (
        experimentalOff &&
        cmd.optDefs.find((o) => o.name === opt.name)?.experimental
      ) {
        this.#diagnostics.push(
          diag(
            opt,
            experimentalDisabledMessage("option", opt.name),
            "experimental-disabled",
          ),
        );
        seen.add(opt.name);
        continue;
      }
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

  /** Array literals passed where a `record` is declared must be records
   *  (`[a:1 b:2]`) or entries arrays (`[[a 1] [b 2]]`). Only clearly-wrong
   *  literal elements are flagged; dynamic values are left to runtime. */
  #checkRecordShapes(c: CommandExpressionNode, cmd: ICommand): void {
    const wantsRecord = (t: string | string[]): boolean =>
      Array.isArray(t) ? t.includes("record") : t === "record";
    const check = (node: Node | undefined, label: string): void => {
      if (node?.type !== NodeType.ArrayExpression) return;
      const elements = (node as any).elements as Node[];
      if (elements.some((el) => el.type === NodeType.NamedArg)) return; // mixed-array check covers the rest
      for (const el of elements) {
        // A valid entries-array element is a [name value] pair; dynamic
        // nodes (variables, helpers, calls) can't be judged statically.
        if (
          el.type === NodeType.VariableIdentifier ||
          el.type === NodeType.HelperFunctionExpression ||
          el.type === NodeType.CallExpression
        ) {
          continue;
        }
        const isPair =
          el.type === NodeType.ArrayExpression &&
          ((el as any).elements as Node[]).length === 2;
        if (!isPair) {
          this.#diagnostics.push(
            diag(
              el,
              `${label} takes a record — write [a:1 b:2] (or [name value] pairs).`,
              "record-shape",
            ),
          );
          return;
        }
      }
    };
    for (let i = 0; i < cmd.argDefs.length; i++) {
      if (wantsRecord(cmd.argDefs[i].type)) {
        check(c.args[i], `<${cmd.argDefs[i].name}>`);
      }
    }
    for (const opt of c.opts) {
      const def = cmd.optDefs.find((o) => o.name === opt.name);
      if (def && wantsRecord(def.type)) check(opt.value, `--${def.name}`);
    }
  }

  /** A bareword that starts with `0x` can never be a valid value: a real
   *  address parses as an AddressLiteral and valid hex as a BytesLiteral, so
   *  a surviving `0x…` bareword is a malformed literal (often a doc/example
   *  placeholder like `0x1234...abcd`). */
  #checkMalformedHexLiterals(c: CommandExpressionNode): void {
    const barewords: Node[] = [];
    for (const arg of c.args) collectBarewords(arg, barewords);
    for (const opt of c.opts) collectBarewords(opt.value, barewords);
    for (const bw of barewords) {
      const value = bw.value as string;
      if (!/^0x/.test(value)) continue;
      this.#diagnostics.push(
        diag(
          bw,
          `"${value}" is not a valid address or hex value. An address is 0x followed by 40 hex characters; a hex value is 0x followed by hex characters (e.g. 0xdeadbeef).`,
          "malformed-hex-literal",
        ),
      );
    }
  }

  /** Mixed record arrays (`[1 a:2]`) and named args inside inline call
   *  expressions — structural misuse the parser accepts but nothing can
   *  bind. */
  #checkNamedArgStructures(c: CommandExpressionNode): void {
    const visit = (node: Node): void => {
      switch (node.type) {
        case NodeType.ArrayExpression: {
          const elements = (node as any).elements as Node[];
          const namedCount = elements.filter(
            (el) => el.type === NodeType.NamedArg,
          ).length;
          if (namedCount > 0 && namedCount < elements.length) {
            this.#diagnostics.push(
              diag(
                node,
                "Arrays cannot mix record entries (name:value) with positional elements.",
                "mixed-array-elements",
              ),
            );
          }
          for (const el of elements) visit(el);
          break;
        }
        case NodeType.NamedArg:
          visit((node as any).value as Node);
          break;
        case NodeType.HelperFunctionExpression:
          for (const a of (node as HelperFunctionNode).args) visit(a);
          break;
        case NodeType.CallExpression: {
          const call = node as CallExpressionNode;
          visit(call.target);
          for (const a of call.args) {
            if (a.type === NodeType.NamedArg) {
              this.#diagnostics.push(
                diag(
                  a,
                  "Named arguments are not supported in inline call expressions.",
                  "named-arg-in-call",
                ),
              );
            }
            visit(a);
          }
          break;
        }
        default:
          break;
      }
    };
    for (const arg of c.args) visit(arg);
    for (const opt of c.opts) visit(opt.value);
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
    if (!name.startsWith("$")) return;

    // Config variables ($mod:key): declared-key validation.
    if (name.includes(":")) {
      this.#checkConfigVarUse(name, at);
      return;
    }

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
      diag(
        at,
        `Variable ${name} is not defined.${this.#configNearMiss(name)}`,
        "undefined-variable",
      ),
    );
  }

  /** Validate a `$mod:key` config-variable read. */
  #checkConfigVarUse(name: string, at: Node): void {
    const cfg = parseConfigVarName(name);
    if (!cfg) {
      this.#diagnostics.push(
        diag(
          at,
          `${name} is not a valid config variable name — expected $<module>:<key> with a letters-and-digits key.${this.#configNearMiss(name)}`,
          "invalid-config-var",
        ),
      );
      return;
    }
    if (!this.#schemas.isLoaded(cfg.module)) {
      this.#diagnostics.push(
        this.#schemas.isRegistered(cfg.module)
          ? diag(
              at,
              `Module "${cfg.module}" is registered but not loaded. Add "load ${cfg.module}" before this line.`,
              "module-not-loaded",
            )
          : this.#schemas.isExperimentalModule(cfg.module)
            ? experimentalModuleDiag(cfg.module, at)
            : diag(
                at,
                `Module "${cfg.module}" is not registered.${didYouMean(
                  cfg.module,
                  this.#schemas.registeredNames(),
                )}`,
                "unknown-module",
              ),
      );
      return;
    }
    if (this.#schemas.isOpaque(cfg.module)) return;
    const def = this.#schemas
      .configDefs(cfg.module)
      .find((d) => d.name === cfg.key);
    if (!def) {
      this.#diagnostics.push(
        diag(
          at,
          `Unknown config variable ${name}.${didYouMean(
            cfg.key,
            this.#schemas.configDefs(cfg.module).map((d) => d.name),
          )}`,
          "unknown-config",
        ),
      );
      return;
    }
    if (
      def.default === undefined &&
      !this.#definedSoFar.has(name) &&
      !this.#meta.everDefined.has(name)
    ) {
      this.#diagnostics.push(
        diag(
          at,
          `${name} is never set and has no default.`,
          "unset-config",
          "warning",
        ),
      );
    }
  }

  /** Suggestion when a plain/legacy variable name matches a declared config
   *  key of a loaded module (e.g. `$token.tokenlist` → `$std:tokenlist`). */
  #configNearMiss(name: string): string {
    const bare = name.slice(1); // strip $
    const key = bare.includes(".")
      ? bare.slice(bare.lastIndexOf(".") + 1)
      : bare.includes(":")
        ? bare.slice(bare.lastIndexOf(":") + 1)
        : bare;
    for (const [mod, defs] of this.#schemas.allDeclaredConfigs()) {
      for (const d of defs) {
        if (d.name === key || d.name.toLowerCase() === key.toLowerCase()) {
          return ` Did you mean $${mod}:${d.name}?`;
        }
      }
    }
    return "";
  }

  /** Colon-named variables in binding (definition) positions: only `set`
   *  (allowConfig) may bind config vars; there they get declared-key and
   *  literal type validation. Plain names that match a declared config key
   *  get a near-miss hint (silent no-op otherwise). */
  #checkConfigDefPositions(c: CommandExpressionNode, cmd: ICommand): void {
    for (let i = 0; i < cmd.argDefs.length; i++) {
      const def = cmd.argDefs[i];
      if (!isVariableDef(def.type)) continue;
      const node = c.args[i];
      if (node?.type !== NodeType.VariableIdentifier) continue;
      const name = node.value as string;

      if (!name.includes(":")) {
        // `set $tokenlist …` while a loaded module declares `tokenlist` —
        // almost certainly meant the config var.
        if (def.allowConfig) {
          const hint = this.#configNearMiss(name);
          if (hint) {
            this.#diagnostics.push(
              diag(
                node,
                `${name} is a plain variable.${hint}`,
                "config-near-miss",
                "warning",
              ),
            );
          }
        }
        continue;
      }

      if (!def.allowConfig) {
        this.#diagnostics.push(
          diag(
            node,
            `Config variables can only be assigned with set.`,
            "config-set-only",
          ),
        );
        continue;
      }

      // set's config-write position: declared-key checks…
      this.#checkConfigVarUse(name, node);

      // …and literal type validation of the assigned value.
      const cfg = parseConfigVarName(name);
      if (!cfg) continue;
      const configDef = this.#schemas
        .configDefs(cfg.module)
        .find((d) => d.name === cfg.key);
      const valueNode = c.args[i + 1];
      if (
        configDef &&
        valueNode &&
        LITERAL_NODE_TYPES.has(valueNode.type) &&
        !Array.isArray(configDef.type) &&
        CHECKABLE_LITERAL_TYPES.has(configDef.type)
      ) {
        try {
          validateArgType(name, valueNode.value, configDef.type);
        } catch (e: any) {
          this.#diagnostics.push(
            diag(valueNode, e.message, "literal-type-mismatch"),
          );
        }
      }
    }
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
    // A load command's import list contains bare helper *names*, not
    // invocations — skip it.
    const skipNode = isLoadCommand(c) ? c.args[1] : undefined;
    for (const arg of c.args) {
      if (arg === skipNode) continue;
      collectHelpers(arg, helpers);
    }
    for (const opt of c.opts) collectHelpers(opt.value, helpers);

    for (const h of helpers) {
      if (h.rename) {
        this.#diagnostics.push(
          diag(
            h,
            `The >@${h.rename} rename suffix is only valid inside a load import list.`,
            "invalid-rename",
          ),
        );
      }

      if (!h.module && this.#meta.defHelpers.has(h.name)) continue;

      // Resolve the helper to its owning module + local name.
      let owningModule: string;
      let localName = h.name;
      const imported = h.module
        ? undefined
        : this.#meta.importedHelpers.get(h.name);

      if (h.module) {
        owningModule = h.module;
        if (!this.#schemas.isLoaded(owningModule)) {
          this.#diagnostics.push(
            this.#schemas.isRegistered(owningModule)
              ? diag(
                  h,
                  `Module "${owningModule}" is registered but not loaded. Add "load ${owningModule}" before this line.`,
                  "module-not-loaded",
                )
              : this.#schemas.isExperimentalModule(owningModule)
                ? experimentalModuleDiag(owningModule, h)
                : diag(
                    h,
                    `Module "${owningModule}" is not registered.${didYouMean(
                      owningModule,
                      this.#schemas.registeredNames(),
                    )}`,
                    "unknown-module",
                  ),
          );
          continue;
        }
      } else if (imported) {
        owningModule = imported.module;
        localName = imported.sourceName;
        if (!this.#schemas.isLoaded(owningModule)) continue; // load line already flagged
      } else if (h.name.endsWith("!")) {
        // On-chain `!` helpers are dispatched by local name inside
        // expression-taking commands (e.g. assertions:assert), so an
        // unqualified reference resolves against any loaded module that
        // declares it.
        const owner = this.#schemas
          .loadedModuleNames()
          .find((m) => this.#schemas.hasHelper(m, h.name));
        if (owner) continue;
        owningModule = "std";
      } else {
        owningModule = "std";
      }

      if (this.#schemas.isOpaque(owningModule)) continue;

      const exists =
        this.#schemas.hasHelper(owningModule, localName) ||
        this.#schemas.hasConstant(owningModule, localName);
      if (!exists) {
        const known = [
          ...this.#schemas.helperNames(h.module ?? "std"),
          ...(h.module ? [] : this.#meta.importedHelpers.keys()),
        ];
        this.#diagnostics.push(
          this.#schemas.isExperimentalHelper(owningModule, localName)
            ? diag(
                h,
                experimentalDisabledMessage("helper", localName),
                "experimental-disabled",
              )
            : diag(
                h,
                `Helper @${this.#displayHelperName(h)} does not exist${
                  h.module ? ` on module "${h.module}"` : ""
                }.${didYouMean(h.name, known)}${
                  h.module
                    ? ""
                    : " Qualify it as @<module>:name or add it to the module's load import list."
                }`,
                "unknown-helper",
              ),
        );
        continue;
      }

      // Helper arity, from statically-stored arg defs.
      const argDefs = this.#schemas.getHelperArgDefs(owningModule, localName);
      if (argDefs) {
        // Named args (`name:value`) validate against the arg defs; each
        // partition issue maps to its own diagnostic on the offending node.
        const { issues } = partitionHelperArgs(h.args, argDefs as ArgDef[]);
        for (const issue of issues) {
          let message = `@${this.#displayHelperName(h)}: ${issue.message}`;
          if (issue.code === "unknown-named-arg") {
            message += didYouMean(
              issue.node.name,
              (argDefs as ArgDef[]).filter((d) => !d.rest).map((d) => d.name),
            );
          }
          this.#diagnostics.push(diag(issue.node, message, issue.code));
        }
        const arity = computeCommandArity(argDefs as ArgDef[], h.args);
        if (arity.isError) {
          this.#diagnostics.push(
            diag(
              h,
              `@${this.#displayHelperName(h)}: ${buildArgsLengthErrorMsg(
                arity.effectiveArgCount,
                arity.comparison,
              )}`,
              "arg-count",
            ),
          );
        }
      } else if (h.args.some((a) => a.type === NodeType.NamedArg)) {
        // No static arg defs (e.g. proxied helper params) — named args
        // can't be validated, but flag them so they aren't silently odd.
        for (const a of h.args) {
          if (a.type !== NodeType.NamedArg) continue;
          this.#diagnostics.push(
            diag(
              a,
              `@${this.#displayHelperName(h)} does not declare named arguments.`,
              "unknown-named-arg",
              "warning",
            ),
          );
        }
      }
      // Non-batchable helper inside a batch context.
      if (batchStack.length > 0) {
        const batchable = await this.#schemas.getHelperBatchable(
          owningModule,
          localName,
        );
        if (batchable === false) {
          this.#diagnostics.push(
            diag(
              h,
              `Helper @${this.#displayHelperName(h)} reads on-chain state and cannot be used inside ${
                batchStack[batchStack.length - 1]
              }; read it into a variable with \`set\` first.`,
              "not-batchable",
            ),
          );
        }
      }
    }
  }

  #displayHelperName(h: HelperFunctionNode): string {
    return h.module ? `${h.module}:${h.name}` : h.name;
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

  // --- Pass 3: control-flow placement --------------------------------------
  //
  // `loop break` / `loop continue` must sit inside a loop block and
  // `def return` inside a def command body. This is a dedicated walk (not
  // part of pass 2) because it must descend into def bodies, which pass 2
  // deliberately treats as opaque. It also owns the loop form checks that
  // the generic arity check lost when <value>/<block> became optional.

  async #checkControlFlow(
    body: CommandExpressionNode[],
    state: {
      loopDepth: number;
      inDefBody: boolean;
      /** Batch-context name crossed since the nearest enclosing loop. */
      boundary?: string;
    },
  ): Promise<void> {
    for (const c of body) {
      if (isDefCommand(c)) {
        if (isReturnDef(c)) {
          if (!state.inDefBody) {
            this.#diagnostics.push(
              diag(
                c,
                `"def return" can only be used inside a def command body.`,
                "control-flow-placement",
              ),
            );
          }
          if (c.args.length > 1) {
            this.#diagnostics.push(
              diag(c, `"def return" takes no arguments.`, "arg-count"),
            );
          }
          continue;
        }
        // Descend into command-def bodies (directly or inside a `def
        // module` block): each is a fresh def-body context — loop signals
        // never cross a def boundary.
        const defs = isModuleDef(c)
          ? ((this.#blocks(c)[0]?.body ?? []).filter(
              isDefCommand,
            ) as CommandExpressionNode[])
          : [c];
        for (const d of defs) {
          if (isReturnDef(d)) {
            this.#diagnostics.push(
              diag(
                d,
                `"def return" can only be used inside a def command body.`,
                "control-flow-placement",
              ),
            );
            continue;
          }
          if (d.args[0]?.type !== NodeType.Bareword || isModuleDef(d)) continue;
          const blk = this.#blocks(d)[0];
          if (blk) {
            await this.#checkControlFlow(blk.body, {
              loopDepth: 0,
              inDefBody: true,
            });
          }
        }
        continue;
      }

      if (isLoopCommand(c)) {
        const kw = loopConnector(c);

        if (kw === "break" || kw === "continue") {
          if (state.loopDepth === 0) {
            this.#diagnostics.push(
              diag(
                c,
                state.boundary
                  ? `"loop ${kw}" cannot cross the ${state.boundary} boundary.`
                  : `"loop ${kw}" can only be used inside a loop block.`,
                "control-flow-placement",
              ),
            );
          }
          if (c.args.length > 1) {
            this.#diagnostics.push(
              diag(c, `"loop ${kw}" takes no arguments.`, "arg-count"),
            );
          }
          continue;
        }

        if (kw === "of" || kw === "until") {
          const nonBlockArgs = c.args.filter(
            (a) => a.type !== NodeType.BlockExpression,
          ).length;
          const expected = kw === "of" ? 3 : 2;
          if (nonBlockArgs !== expected) {
            this.#diagnostics.push(
              diag(
                c,
                kw === "of"
                  ? `"loop of" expects a loop variable and an array: loop $x of <array> ( ... ).`
                  : `"loop until" expects a condition: loop until <condition> ( ... ).`,
                "arg-count",
              ),
            );
          }
          if (this.#blocks(c).length === 0) {
            this.#diagnostics.push(
              diag(
                c,
                `"loop" requires a ( ... ) block for <block>.`,
                "missing-block",
              ),
            );
          }
        } else {
          this.#diagnostics.push(
            diag(
              c,
              `"loop" expects "of", "until", "break" or "continue".`,
              "unknown-loop-form",
            ),
          );
        }

        for (const blk of this.#blocks(c)) {
          await this.#checkControlFlow(blk.body, {
            ...state,
            loopDepth: state.loopDepth + 1,
            boundary: undefined,
          });
        }
        continue;
      }

      // Batch-context openers (batch / connect / ...) are a boundary loop
      // signals cannot cross: a break inside would silently drop the
      // partially-built batch.
      const cmd = await this.#resolveCommand(c);
      const opensBatch = !!cmd?.createsBatchContext;
      for (const blk of this.#blocks(c)) {
        await this.#checkControlFlow(
          blk.body,
          opensBatch
            ? {
                loopDepth: 0,
                inDefBody: state.inDefBody,
                boundary:
                  state.loopDepth > 0 ? this.#displayName(c) : state.boundary,
              }
            : state,
        );
      }
    }
  }

  // --- Shared helpers ------------------------------------------------------

  /** Structural validation shared by all capture kinds (`->`, `-!>`, `$>`, `$*>`). */
  #checkCaptures(c: CommandExpressionNode, owningModule: string): void {
    const txCaps = c.txCaptures ?? [];
    const hasCaptures =
      (c.eventCaptures?.length ?? 0) > 0 ||
      (c.errorCaptures?.length ?? 0) > 0 ||
      txCaps.length > 0;
    if (!hasCaptures) return;

    // `if`/`loop` (and def commands) execute their inner transactions
    // while interpreting the block. Event and tx captures still work —
    // the interpreter reuses the recorded receipts — but error captures
    // observe the send itself, which already happened: an inner revert
    // propagates before the outer boundary is reached.
    const isBlockish =
      (owningModule === "std" &&
        (c.name === "if" || c.name === "loop") &&
        this.#blocks(c).length > 0) ||
      (!c.module && this.#meta.defCommands.has(c.name));
    if (isBlockish && (c.errorCaptures?.length ?? 0) > 0) {
      this.#diagnostics.push(
        diag(
          c.errorCaptures?.[0] ?? c,
          `Error captures are not supported on "${c.name}" — its transactions execute inside the block; capture on the inner commands instead.`,
          "capture-on-block-command",
        ),
      );
    }

    if (txCaps.length > 0 && (c.errorCaptures?.length ?? 0) > 0) {
      this.#diagnostics.push(
        diag(
          txCaps[0],
          "Tx captures ($>, $*>) cannot be combined with error captures (-!>, -?!>) — a reverted transaction has no meaningful hash to capture.",
          "tx-capture-with-error-capture",
        ),
      );
    }

    for (const all of [false, true]) {
      const sameForm = txCaps.filter((t) => t.all === all);
      if (sameForm.length > 1) {
        this.#diagnostics.push(
          diag(
            sameForm[1],
            `Duplicate "${all ? "$*>" : "$>"}" capture — each tx-capture form may appear at most once per command.`,
            "duplicate-tx-capture",
          ),
        );
      }
    }
  }

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

  /** Resolve a command node to its schema: qualified module → import
   *  binding → std prelude. Strict — no fallbacks between modules. */
  #resolveCommand(c: CommandExpressionNode): Promise<ICommand | undefined> {
    if (c.module) return this.#schemas.getCommand(c.module, c.name);
    const imported = this.#meta.importedCommands.get(c.name);
    if (imported) {
      return this.#schemas.getCommand(imported.module, imported.sourceName);
    }
    return this.#schemas.getCommand("std", c.name);
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
  experimentalModuleNames: string[] = [],
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
      experimentalModuleNames,
    );
    return await new SemanticAnalyzer(schemas).analyze(body);
  } catch {
    return [];
  }
}

/**
 * Cross-module dispatch for on-chain (`!`) helper faces.
 *
 * Any loaded module's helper may declare a `compile` face; inside an
 * on-chain expression the compiler hands the raw AST node to the owning
 * module's face through `compileOnchainHelper`. Resolution mirrors the
 * interpreter's execution-time helper resolution: qualified names are
 * strict, unqualified names go DEF bindings → IMPORT bindings → host module
 * → loaded modules → std.
 *
 * DEF comes first for the same reason it does off-chain: a `def @name!` in
 * the script should win over a module helper of the same name, so a script
 * can name its own lambda without checking what every loaded module already
 * exports.
 */
import { ErrorException, ExperimentalDisabledError } from "../errors";
import type { Module } from "../Module";
import type { DefValue, HelperFunctionNode, ImportValue, Node } from "../types";
import { BindingsSpace, NodeType, resolveHelper } from "../types";
import {
  experimentalDisabledMessage,
  isExperimentalEnabled,
} from "../utils/experimental";
import { compileDefCall } from "./defs";
import type { CompileCtx, HelperCompile, Operand } from "./types";

/** The trailing `!` is the language convention for on-chain-evaluated
 *  helpers, so inside an on-chain expression any `!`-named helper is
 *  compiled (via its definition's `compile` face) rather than interpreted
 *  at composition time. */
export function isBangHelperNode(node: Node): node is HelperFunctionNode {
  return (
    node.type === NodeType.HelperFunctionExpression &&
    (node as HelperFunctionNode).name.endsWith("!")
  );
}

/**
 * The compiler's operand entry point, registered by `compile.ts` at module
 * load. A def is inlined by compiling its substituted body, but importing
 * `compile.ts` from here would close a cycle (compile → dispatch → compile),
 * so the dependency is inverted into this hook instead.
 */
type OperandCompiler = (ctx: CompileCtx, node: Node) => Promise<Operand>;
let compileOperandRef: OperandCompiler | undefined;

export function setOperandCompiler(fn: OperandCompiler): void {
  compileOperandRef = fn;
}

/** Resolve what `node`'s name refers to, mirroring
 *  `makeExecutionResolveHelper`: qualified `@mod:name!` strict; unqualified
 *  → DEF bindings → IMPORT bindings (honoring renames) → host module →
 *  loaded-modules scan → std fallback. */
type Resolved =
  | { kind: "module"; owner: Module; localName: string }
  | { kind: "def"; def: DefValue };

function resolveOwner(ctx: CompileCtx, node: HelperFunctionNode): Resolved {
  const { modules } = ctx.module.context;
  const std = ctx.module.context.getStd?.();
  const name = node.name;

  if (node.module) {
    const m =
      node.module === "std"
        ? std
        : node.module === ctx.module.name
          ? ctx.module
          : modules.find((mod) => mod.name === node.module);
    if (!m) {
      throw new ErrorException(`module ${node.module} not loaded`);
    }
    if (!m.helpers[name]) {
      throw new ErrorException(
        `unknown on-chain helper @${node.module}:${name}`,
      );
    }
    return { kind: "module", owner: m, localName: name };
  }

  // A def is keyed with its `!` intact (`@double!`), which is exactly the
  // node's name here, so no stripping.
  const defined = ctx.module.bindingsManager.getBindingValue(
    `@${name}`,
    BindingsSpace.DEF,
  ) as DefValue | undefined;
  if (defined?.kind === "helper") {
    return { kind: "def", def: defined };
  }

  const imported = ctx.module.bindingsManager.getBindingValue(
    `@${name}`,
    BindingsSpace.IMPORT,
  ) as ImportValue | undefined;
  if (imported) {
    const m =
      imported.module === "std"
        ? std
        : modules.find((mod) => mod.name === imported.module);
    if (!m) {
      throw new ErrorException(`module ${imported.module} not loaded`);
    }
    return { kind: "module", owner: m, localName: imported.name };
  }

  if (ctx.module.helpers[name]) {
    return { kind: "module", owner: ctx.module, localName: name };
  }
  const scanned = modules.find((mod) => mod.helpers[name]);
  if (scanned) {
    return { kind: "module", owner: scanned, localName: name };
  }
  if (std?.helpers[name]) {
    return { kind: "module", owner: std, localName: name };
  }
  throw new ErrorException(`unknown on-chain helper @${name}`);
}

/**
 * Compile a `!` helper node into an operand by dispatching to the owning
 * module's `compile` face through its helper registry — the definition and
 * its compilation live in one file, and the owning module instance is
 * swapped into `ctx.module` so the face runs against its own module.
 */
export async function compileOnchainHelper(
  ctx: CompileCtx,
  node: HelperFunctionNode,
): Promise<Operand> {
  const resolved = resolveOwner(ctx, node);
  if (resolved.kind === "def") {
    // A def has no compile face of its own: it is INLINED. Its body is
    // compiled with the call's argument nodes substituted for its
    // parameters, so the result is indistinguishable from having written
    // the body at the call site.
    if (!compileOperandRef) {
      throw new ErrorException(
        "the on-chain compiler is not initialised; this is a bug in the SDK wiring",
      );
    }
    return (await compileDefCall(
      ctx,
      resolved.def,
      node,
      compileOperandRef,
    )) as Operand;
  }
  const { owner, localName } = resolved;
  const helper = await resolveHelper(owner.helpers[localName]);
  if (
    (helper as { experimental?: boolean }).experimental &&
    !isExperimentalEnabled()
  ) {
    throw new ExperimentalDisabledError(
      experimentalDisabledMessage("helper", localName),
    );
  }
  const compile = (helper as { compile?: HelperCompile }).compile;
  if (!compile) {
    throw new ErrorException(
      `@${node.name} does not support on-chain evaluation`,
    );
  }
  const localNode =
    localName === node.name ? node : { ...node, name: localName };
  return compile(
    owner === ctx.module ? ctx : { ...ctx, module: owner },
    localNode,
  );
}

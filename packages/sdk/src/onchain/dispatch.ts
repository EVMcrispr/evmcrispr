/**
 * Cross-module dispatch for on-chain (`!`) helper faces.
 *
 * Any loaded module's helper may declare a `compile` face; inside an
 * on-chain expression the compiler hands the raw AST node to the owning
 * module's face through `compileOnchainHelper`. Resolution mirrors the
 * interpreter's execution-time helper resolution: qualified names are
 * strict, unqualified names go IMPORT bindings → host module → loaded
 * modules → std.
 */
import { ErrorException, ExperimentalDisabledError } from "../errors";
import type { Module } from "../Module";
import type { HelperFunctionNode, ImportValue, Node } from "../types";
import { BindingsSpace, NodeType, resolveHelper } from "../types";
import {
  experimentalDisabledMessage,
  isExperimentalEnabled,
} from "../utils/experimental";
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

/** Resolve the module owning `node`'s helper, mirroring
 *  `makeExecutionResolveHelper`: qualified `@mod:name!` strict; unqualified
 *  → IMPORT bindings (honoring renames) → host module → loaded-modules scan
 *  → std fallback (when the host runtime exposes the std instance). */
function resolveOwner(
  ctx: CompileCtx,
  node: HelperFunctionNode,
): { owner: Module; localName: string } {
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
    return { owner: m, localName: name };
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
    return { owner: m, localName: imported.name };
  }

  if (ctx.module.helpers[name]) {
    return { owner: ctx.module, localName: name };
  }
  const scanned = modules.find((mod) => mod.helpers[name]);
  if (scanned) {
    return { owner: scanned, localName: name };
  }
  if (std?.helpers[name]) {
    return { owner: std, localName: name };
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
  const { owner, localName } = resolveOwner(ctx, node);
  const helper = await resolveHelper(owner.helpers[localName]);
  if (
    (helper as { experimental?: boolean }).experimental &&
    !isExperimentalEnabled()
  ) {
    throw new ExperimentalDisabledError(
      experimentalDisabledMessage("helper", localName),
    );
  }
  // `compileAssert` is the legacy attachment of the assertions module's
  // defineBangHelper wrapper — honored until the bang files migrate onto
  // defineHelper's `compile` face.
  const compile =
    (helper as { compile?: HelperCompile }).compile ??
    (helper as { compileAssert?: HelperCompile }).compileAssert;
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

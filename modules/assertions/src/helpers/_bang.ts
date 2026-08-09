import type { HelperConfigShared, HelperFunctionNode } from "@evmcrispr/sdk";
import { defineHelper } from "@evmcrispr/sdk";
import type {
  CompileCtx,
  HelperCompile,
  Operand,
} from "@evmcrispr/sdk/onchain";
import type Assertions from "..";

/** Compiles a `!` helper node into an assertion-expression operand. */
export type BangCompile = (
  ctx: CompileCtx,
  node: HelperFunctionNode,
) => Promise<Operand>;

export interface BangHelperConfig extends HelperConfigShared<Assertions> {
  /** How the on-chain compilers turn this helper's raw AST node into
   *  combinator calldata — forwarded to `defineHelper`'s `compile` face. */
  compileAssert: BangCompile;
}

/**
 * LEGACY wrapper for the assertions module's on-chain (`!`-suffixed)
 * helpers, now a thin veneer over `defineHelper`'s `compile` face: the
 * on-chain compilers dispatch `!` nodes to the face via
 * `compileOnchainHelper`, and `defineHelper`'s own poison pill throws the
 * "evaluates on-chain" error when a `!` node is interpreted off-chain.
 * These files still declare `name: "x!"`; they migrate to bare names (and
 * plain `defineHelper({ compile })`) with the two-key codegen emission.
 *
 * NOTE on field order: the codegen that builds `_generated.ts` regex-scans
 * each helper's source, first match wins. Keep `name`, `description`,
 * `returnType` and `args` BEFORE `compileAssert` in every config literal,
 * and avoid the literal substrings `name: "`, `description: "`,
 * `returnType: "` and `args: [` inside `compileAssert` bodies.
 */
export function defineBangHelper(config: BangHelperConfig) {
  const { compileAssert, ...helperConfig } = config;
  return defineHelper<Assertions>({
    ...helperConfig,
    compile: compileAssert as HelperCompile,
  });
}

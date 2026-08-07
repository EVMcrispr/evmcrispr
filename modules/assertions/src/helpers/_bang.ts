import type { HelperConfig, HelperFunctionNode } from "@evmcrispr/sdk";
import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Assertions from "..";
import type { CompilerCtx, Operand } from "../lib/compiler";

/** Compiles a `!` helper node into an assertion-expression operand. */
export type BangCompile = (
  ctx: CompilerCtx,
  node: HelperFunctionNode,
) => Promise<Operand>;

export interface BangHelperConfig
  extends Omit<HelperConfig<Assertions>, "run"> {
  /** How the `assertions:assert` compiler turns this helper's raw AST node
   *  into combinator calldata. Dispatched through the module's helper
   *  registry, so the definition and its compilation live in one file. */
  compileAssert: BangCompile;
}

/**
 * Define an on-chain (`!`-suffixed) helper. These helpers never run
 * off-chain: the `assertions:assert` compiler intercepts their raw AST
 * nodes and hands them to the definition's own `compileAssert`, which
 * turns them into combinator calldata evaluated at assertion time. The
 * `run` registered here exists for completions, hover docs, and a clear
 * error when one is used outside an assertion.
 *
 * NOTE on field order: the codegen that builds `_generated.ts` regex-scans
 * each helper's source, first match wins. Keep `name`, `description`,
 * `returnType` and `args` BEFORE `compileAssert` in every config literal,
 * and avoid the literal substrings `name: "`, `description: "`,
 * `returnType: "` and `args: [` inside `compileAssert` bodies.
 */
export function defineBangHelper(config: BangHelperConfig) {
  const { compileAssert, ...helperConfig } = config;
  return Object.assign(
    defineHelper<Assertions>({
      ...helperConfig,
      async run() {
        throw new ErrorException(
          `@${config.name} evaluates on-chain and is only valid inside an assertions:assert expression`,
        );
      },
    }),
    { compileAssert },
  );
}

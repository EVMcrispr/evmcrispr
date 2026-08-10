import { evml, Interpreter, parseScript } from "@evmcrispr/core";
import {
  BindingsSpace,
  type CommandExpressionNode,
  type Node,
  NodeType,
} from "@evmcrispr/sdk";
import type { CompileCtx, Operand } from "@evmcrispr/sdk/onchain";
import {
  CORE_ADDRESS,
  compileOperand,
  compileTopCall,
  OPERATORS_ADDRESS,
} from "@evmcrispr/sdk/onchain";
import type { Address, Transport } from "viem";
import { gnosis } from "viem/chains";

import { getTransports } from "../client";
import { TEST_ACCOUNT_ADDRESS } from "../constants";

export interface CompileEnv {
  /** The `load` line, e.g. `"lang [@sort @len]"`. */
  module?: string;
  /** Extra script prepended to every expression (`set`, `def`, …). */
  preamble?: string;
  chainId?: number;
  transports?: Record<number, Transport>;
  core?: Address;
  operators?: Address;
}

function preambleOf(env: CompileEnv): string {
  return [
    "load assertions",
    env.module ? `load ${env.module}` : "",
    env.preamble ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

function interpreterFor(env: CompileEnv): Interpreter {
  return new Interpreter(evml.registry, {
    account: TEST_ACCOUNT_ADDRESS,
    chainId: env.chainId ?? gnosis.id,
    transports: env.transports ?? getTransports(),
  });
}

/**
 * Compile one expression to its raw, PRE-JUDGE operand.
 *
 * Deliberately not routed through `assertions:assert`. The judge folds a
 * String/Bytes side into `hash(x) EQ digest`, after which the value cannot be
 * recovered — so going through assert would only ever tell you pass/fail.
 * This mirrors assert's own side dispatch and stops before the judging step.
 */
export async function compileExpression(
  expression: string,
  env: CompileEnv = {},
): Promise<{ operand: Operand; ctx: CompileCtx; evm: Interpreter }> {
  const preamble = preambleOf(env);

  // Parse the whole script to get the expression's node, but interpret ONLY
  // the preamble — `load`/`set`/`def` must bind without the expression being
  // evaluated off-chain, which is the entire point of compiling it instead.
  const { ast } = parseScript(`${preamble}\nset $res ${expression}`);
  const setCommand = ast.body
    .filter((n: Node) => (n as CommandExpressionNode).name === "set")
    .at(-1) as CommandExpressionNode | undefined;
  if (!setCommand) throw new Error(`could not parse expression: ${expression}`);
  const node = setCommand.args[1]!;

  const evm = interpreterFor(env);
  await evm.interpret(preamble);

  const ctx: CompileCtx = {
    module: evm.getModule("assertions")!,
    interpreters: {
      interpretNode: evm.interpretNode,
      interpretNodes: evm.interpretNodes,
    },
    core: env.core ?? CORE_ADDRESS,
    operators: env.operators ?? OPERATORS_ADDRESS,
  };

  const operand =
    node.type === NodeType.CallExpression
      ? // compileOperand would route a bare `::` call through
        // compileCallOperand, which rejects a lens selecting string/bytes.
        // compileTopCall is what a real assertion side actually gets.
        await compileTopCall(ctx, node as never)
      : await compileOperand(ctx, node);

  return { operand, ctx, evm };
}

/** The `load` line's module name: `"lang [@sort @len]"` -> `"lang"`. */
export function moduleBaseName(module: string | undefined): string | undefined {
  return module?.trim().split(/[\s[]/)[0] || undefined;
}

/** Evaluate an expression off-chain, the way a user would. */
export async function runExpression(
  expression: string,
  env: CompileEnv = {},
): Promise<unknown> {
  const evm = interpreterFor(env);
  await evm.interpret(`${preambleOf(env)}\nset $res ${expression}`);
  return evm.getBinding("$res", BindingsSpace.USER);
}

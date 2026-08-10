import type { Operand } from "@evmcrispr/sdk/onchain";
import { encodeResolve } from "@evmcrispr/sdk/onchain";
import type { Address, Hex, PublicClient } from "viem";

import { decodeResolved, type Norm, normalizeRun } from "./decode";

export interface ResolveOpts {
  core: Address;
  /** ABI type of the resolved bytes, for when the category cannot say.
   *  Any array needs it: an on-chain array is a `Bytes` payload of packed
   *  words and the operand carries no element type. */
  decodeAs?: string;
}

/**
 * Evaluate a compiled operand on-chain and decode the value.
 *
 * `Assertions.resolve` resolves the param and raw-returns the resolved bytes,
 * which is strictly more informative than the judge path: you get the value
 * rather than a pass/fail.
 */
export async function resolveValue(
  client: PublicClient,
  operand: Operand,
  opts: ResolveOpts,
): Promise<Norm> {
  // A constant folded at composition time never reaches the chain; it is
  // already the answer.
  if (operand.kind === "const") return normalizeRun(operand.value);

  // resolve() validates constraints before returning, so a judged param would
  // revert instead of yielding its value. Only the OUTER constraints are
  // dropped — nested ones are part of what the expression means.
  const { data } = await client.call({
    to: opts.core,
    data: encodeResolve({ ...operand.param, constraints: [] }),
  });

  return decodeResolved(
    (data ?? "0x") as Hex,
    operand.cat,
    operand.scale ?? 0,
    opts.decodeAs,
  );
}

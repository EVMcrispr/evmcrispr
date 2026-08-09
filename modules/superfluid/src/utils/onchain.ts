import type { Node } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { CompileCtx } from "@evmcrispr/sdk/onchain";
import { compileOperand } from "@evmcrispr/sdk/onchain";
import type { Address } from "viem";
import { getAddress } from "viem";
import { resolveSuperToken } from "./supertoken";

/**
 * Resolve a `supertoken` argument inside an on-chain face. The Superfluid
 * token list is an off-chain service, so the symbol lookup stays at
 * composition time and the SuperToken address enters the expression as a
 * constant; a nested face that folds to a constant (`@token!`) is accepted
 * too, a live one is not.
 */
export async function compileSuperToken(
  ctx: CompileCtx,
  node: Node,
  face: string,
): Promise<Address> {
  const o = await compileOperand(ctx, node);
  if (o.kind !== "const") {
    throw new ErrorException(
      `${face} resolves its SuperToken at composition time — pass a symbol, address or @token!(...)`,
    );
  }
  return resolveSuperToken(ctx.module, String(o.value));
}

/**
 * Resolve an on-chain face argument that has to be known at composition
 * time because it is the staticcall TARGET (a GDA pool), not a value
 * spliced into calldata.
 */
export async function compileTarget(
  ctx: CompileCtx,
  node: Node,
): Promise<Address> {
  return getAddress(String(await ctx.interpreters.interpretNode(node)));
}

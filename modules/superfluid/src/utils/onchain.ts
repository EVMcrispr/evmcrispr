import type { Node } from "@evmcrispr/sdk";
import type { CompileCtx, ReadArg, ReadTarget } from "@evmcrispr/sdk/onchain";
import { readTarget } from "@evmcrispr/sdk/onchain";
import { resolveSuperToken } from "./supertoken";

/**
 * The SuperToken of an on-chain face, as the contract it reads. A symbol
 * is looked up when the script is built (the Superfluid token list is an
 * off-chain service), and so is an address or a nested face that folds to
 * a constant (`@token!`); a `::!` call or a live face that yields an
 * address is resolved when the assertion runs.
 */
export async function compileSuperToken(
  ctx: CompileCtx,
  node: Node,
  face: string,
): Promise<ReadTarget> {
  return readTarget(ctx, face.replace(/^@/, ""), node, (value) =>
    resolveSuperToken(ctx.module, String(value)),
  );
}

/**
 * The SuperToken of an on-chain face, as an argument of a call to another
 * contract (a forwarder): the resolved address, or the live node itself.
 */
export async function superTokenArg(
  ctx: CompileCtx,
  node: Node,
  face: string,
): Promise<ReadArg> {
  const token = await compileSuperToken(ctx, node, face);
  return typeof token === "string" ? { value: token } : node;
}

/**
 * The contract an on-chain face reads (a GDA pool): an address fixed when
 * the script is built, or a `::!` call resolved when the assertion runs.
 */
export async function compileTarget(
  ctx: CompileCtx,
  node: Node,
  face = "pool",
): Promise<ReadTarget> {
  return readTarget(ctx, face, node);
}

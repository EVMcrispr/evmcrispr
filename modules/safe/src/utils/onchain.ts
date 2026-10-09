import type { Address, Node } from "@evmcrispr/sdk";
import type {
  CompileCtx,
  InputParam,
  ReadTarget,
} from "@evmcrispr/sdk/onchain";
import { readTarget, targetCallParam } from "@evmcrispr/sdk/onchain";
import type { Hex } from "viem";
import type Safe from "..";

/**
 * The Safe a read face reads. Usually fixed when the script is built (an
 * address, a variable, or with no argument the context Safe or connected
 * account); it may also be a `::!` call that returns the Safe's address,
 * resolved when the assertion runs.
 */
export async function safeTarget(
  ctx: CompileCtx,
  helper: string,
  safeNode: Node | undefined,
): Promise<ReadTarget> {
  const module = ctx.module as Safe;
  if (!safeNode) return module.resolveSafe();
  return readTarget(ctx, helper, safeNode, (value) =>
    module.resolveSafe(String(value) as Address),
  );
}

/**
 * The read of a Safe as an on-chain parameter: `data` is the complete
 * calldata of one of the Safe's own view functions, made against the
 * Safe as {@link safeTarget} resolves it.
 */
export async function safeReadParam(
  ctx: CompileCtx,
  helper: string,
  safeNode: Node | undefined,
  data: Hex,
): Promise<InputParam> {
  return targetCallParam(ctx, await safeTarget(ctx, helper, safeNode), data);
}

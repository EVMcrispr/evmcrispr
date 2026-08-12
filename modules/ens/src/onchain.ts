import { chainLabel, ErrorException } from "@evmcrispr/sdk";
import type { Category, CompileCtx, Operand } from "@evmcrispr/sdk/onchain";
import {
  coreCall,
  encodeChain,
  encodeCond,
  rawParam,
  staticCallParam,
  toWord,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";
import { registryMap, requireAddress } from "./addresses";
import { registryAbi } from "./utils";

/**
 * Mainnet, or refuse.
 *
 * The plain faces resolve ENS through a dedicated mainnet client, which an
 * expression cannot do: a staticcall runs on whatever chain executes the
 * batch, and there is no way to ask mainnet from Gnosis. So an on-chain ENS
 * read is only meaningful on chain 1.
 *
 * Sepolia is refused too, even though it has a registry a staticcall could
 * reach. That is the point: the plain faces are mainnet-pinned, so a sepolia
 * registry answers about a DIFFERENT namespace — `@ens:owner(foo.eth)` and
 * `@ens:owner!(foo.eth)` would return two unrelated owners and both would
 * look right. Refusing is the only spelling that cannot silently lie.
 *
 * Previously this fell back to the mainnet registry LITERAL on any other
 * chain, which staticcalled an account with no code and surfaced as an
 * opaque revert at assertion time instead of an error at composition time.
 */
async function requireMainnet(ctx: CompileCtx, label: string): Promise<void> {
  const chainId = await ctx.module.getChainId();
  if (chainId !== 1) {
    throw new ErrorException(
      `ens: ${label} has no on-chain face on ${chainLabel(chainId)} — an assertion evaluates on the chain it runs on, and ENS cannot be read from there. Use the off-chain @ens: face, which resolves against mainnet at composition time.`,
    );
  }
}

/** The registry an on-chain face should address. */
export async function onchainRegistry(ctx: CompileCtx): Promise<Address> {
  await requireMainnet(ctx, "the registry");
  return requireAddress(registryMap, 1, "ENS");
}

/** The same rule for any other ENS address book. */
export async function onchainAddress(
  ctx: CompileCtx,
  map: Map<number, Address>,
  label: string,
): Promise<Address> {
  await requireMainnet(ctx, label);
  return requireAddress(map, 1, label);
}

/** A valid empty ABI `string`/`bytes` return: [0x20][0]. The `cond`
 *  fallback must match the winning branch's encoding, since the winning
 *  bytes pass through raw. */
export const EMPTY_DYNAMIC_RETURN: Hex = `0x${toWord(32n).slice(2)}${toWord(0n).slice(2)}`;

/**
 * The two-hop resolver read every record face shares (the `@addr!`
 * shape): `resolver(node)` on the registry, a `chain` hop into the
 * resolver with `callData`, and a `cond` that turns an unset resolver
 * into `emptyReturn` instead of a revert.
 */
export async function resolverGatedChain(
  ctx: CompileCtx,
  ensNode: Hex,
  callData: Hex,
  emptyReturn: Hex,
  cat: Category,
): Promise<Operand> {
  const registry = await onchainRegistry(ctx);
  const resolverParam = staticCallParam(
    registry,
    encodeFunctionData({
      abi: registryAbi,
      functionName: "resolver",
      args: [ensNode],
    }),
  );
  const gated = staticCallParam(
    ctx.core,
    encodeChain(resolverParam, [callData]),
  );
  return coreCall(
    ctx,
    encodeCond(
      wordOpParam(ctx, "eq", false, resolverParam, rawParam(toWord(0n))),
      rawParam(emptyReturn),
      gated,
    ),
    cat,
  );
}

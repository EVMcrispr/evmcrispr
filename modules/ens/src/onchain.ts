import { chainLabel, ErrorException } from "@evmcrispr/sdk";
import type { CompileCtx } from "@evmcrispr/sdk/onchain";
import type { Address } from "viem";
import { registryMap, requireAddress } from "./addresses";

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

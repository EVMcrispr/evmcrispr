import { isCrossChainProxy } from "@evmcrispr/sdk";
import type { Address, PublicClient } from "viem";
import type { DecodedCall } from "./assess";
import { decodeSafeTxCalls, type SafeSignable } from "./signables";

/** Whether a Safe transaction calls a cross-chain proxy (by the chain's
 *  registry, see `ChainDef.crossChainRegistry`), itself or inside its
 *  MultiSend or ERC-8211 batches. */
export async function callsCrossChainProxy(
  chainId: number,
  signable: SafeSignable,
  client: Pick<PublicClient, "readContract">,
): Promise<boolean> {
  if (signable.kind !== "transaction") return false;
  const targets = new Set<string>();
  const walk = (calls: DecodedCall[]) => {
    for (const call of calls) {
      targets.add(call.to.toLowerCase());
      if (call.decoded.calls) walk(call.decoded.calls);
    }
  };
  walk(decodeSafeTxCalls(signable));
  for (const to of targets)
    if (await isCrossChainProxy(chainId, to as Address, client)) return true;
  return false;
}

import type { Account, Chain, Transport, WalletClient } from "viem";

import { config } from "../config/wagmi";

export async function switchOrAddChain(
  walletClient: WalletClient<Transport, Chain, Account>,
  chainId: number,
) {
  try {
    await walletClient.switchChain({ id: chainId });
  } catch (e: any) {
    const newChain = config.chains.find((c) => c.id === chainId);
    if (newChain) {
      try {
        await (walletClient as any).addChain({ chain: newChain });
        await walletClient.switchChain({ id: chainId });
      } catch (addError) {
        console.error("Failed to add or switch chain:", addError);
        throw new Error(
          `Failed to switch to chain ${chainId}. Please add it manually.`,
        );
      }
    } else {
      throw new Error(`Chain with id ${chainId} not configured.`);
    }
  }
}

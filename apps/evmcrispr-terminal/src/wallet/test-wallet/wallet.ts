// The terminal's test wallet: anvil's public accounts on the networks whose
// RPC is on this machine, experimental only.
import {
  createTestWallet,
  type TestWallet,
  type TestWalletChain,
} from "@evmcrispr/dev-wallet";
import {
  frameAccountAbi,
  frameAccountFactoryAbi,
  frameSponsorAbi,
} from "@evmcrispr/module-frames";
import { fetchContractSource } from "@evmcrispr/sdk";
import { type Chain, parseAbi, type Transport } from "viem";
import { createSigningQueue, type SigningQueue } from "./queue";

/** The terminal's networks, for the test wallet, which serves only those
 *  reached on this machine and refuses the others by name. */
export function testWalletChains(
  chains: readonly Chain[],
  rpcUrls: Record<number, string>,
  transports: Record<number, Transport>,
): TestWalletChain[] {
  return chains.flatMap((chain) => {
    const rpcUrl = rpcUrls[chain.id] ?? chain.rpcUrls.default.http[0];
    return rpcUrl
      ? [
          {
            id: chain.id,
            name: chain.name,
            rpcUrl,
            nativeCurrency: chain.nativeCurrency,
            transport: transports[chain.id],
          },
        ]
      : [];
  });
}

export interface TerminalTestWallet {
  wallet: TestWallet;
  queue: SigningQueue;
}

export function createTerminalTestWallet(
  chains: TestWalletChain[],
): TerminalTestWallet {
  const queue = createSigningQueue();
  const wallet = createTestWallet({
    chains,
    approve: queue.ask,
    // A verified source's ABI, when the chain has one (a local chain rarely
    // does).
    abiFor: async (chainId, address) => {
      const source = await fetchContractSource(chainId, address).catch(
        () => null,
      );
      return source?.abi.length
        ? { abi: parseAbi(source.abi), label: "verified source" }
        : undefined;
    },
    standards: [
      { name: "the frame account", abi: frameAccountAbi },
      { name: "the frame sponsor", abi: frameSponsorAbi },
      { name: "the frame account factory", abi: frameAccountFactoryAbi },
    ],
  });
  return { wallet, queue };
}

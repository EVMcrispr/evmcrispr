import {
  collectPreparedSwitchTargets,
  parseScript,
  switchArgForChainId,
} from "@evmcrispr/core";
import type { Account, Chain, Transport, WalletClient } from "viem";
import { mainnet } from "viem/chains";

import { config } from "../config/wagmi";

export async function switchOrAddChain(
  walletClient: WalletClient<Transport, Chain, Account>,
  chainId: number,
) {
  try {
    await walletClient.switchChain({ id: chainId });
  } catch (_e: any) {
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

function uniqueInOrder(values: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/**
 * Walk every command in the script and align the wallet to the chains
 * the script will need.
 *
 * Algorithm (see plan):
 * 1. Collect every resolved `switch` chain id (literal name/id or `$var`
 *    bound by a preceding literal `std:set $var …`).
 * 2. The script's implicit start chain is mainnet UNLESS the very first
 *    top-level command is a `switch` to a non-mainnet chain.
 * 3. Loop `switchOrAddChain` over each `switch` chain in script order;
 *    a chain that already matches the wallet's current chain is skipped.
 * 4. End on the script's start chain so `interpret(...)` begins on the
 *    right wallet chain.
 *
 * If the wallet rejects a `switchOrAddChain` call (Safe pinned to a
 * single chain, restricted WalletConnect peer, ...) we surface a single
 * actionable error before any transaction is submitted:
 * - script defaulted to mainnet implicitly and the wallet is on a
 *   different chain → "The script should start with
 *   `switch <walletSwitchArg>`."
 * - script targets multiple chains → "Wallet only supports
 *   <walletSwitchArg>."
 * - script explicitly targets one non-wallet chain → "Wallet only
 *   supports <walletSwitchArg>, but the script targets
 *   <scriptSwitchArg>."
 */
export async function prepareChainsForScript(
  walletClient: WalletClient<Transport, Chain, Account>,
  script: string,
): Promise<void> {
  let ast;
  try {
    ast = parseScript(script).ast;
  } catch {
    return;
  }

  const firstTopLevel = ast.body[0];
  const allCommands = ast.getAllCommandsUntilLine(Number.POSITIVE_INFINITY);

  const { orderedSwitchChainIds, leadingSwitchChainId } =
    collectPreparedSwitchTargets(allCommands, firstTopLevel);
  const switchChainIds = uniqueInOrder(orderedSwitchChainIds);

  const firstSwitchChainId = leadingSwitchChainId;
  const startChain = firstSwitchChainId ?? mainnet.id;

  const uniqueChains = uniqueInOrder([startChain, ...switchChainIds]);

  let walletChainId = await walletClient.getChainId();

  const ensure = async (chain: number): Promise<void> => {
    if (chain === walletChainId) return;
    try {
      await switchOrAddChain(walletClient, chain);
      walletChainId = chain;
    } catch {
      const walletSwitchArg = switchArgForChainId(walletChainId);
      if (uniqueChains.length === 1 && firstSwitchChainId === undefined) {
        throw new Error(
          `The script should start with \`switch ${walletSwitchArg}\`.`,
        );
      }
      if (uniqueChains.length > 1) {
        throw new Error(`Wallet only supports ${walletSwitchArg}.`);
      }
      // uniqueChains.length === 1 && firstSwitchChainId !== undefined:
      // script explicitly targets a single chain the wallet can't reach.
      throw new Error(
        `Wallet only supports ${walletSwitchArg}, but the script targets ${switchArgForChainId(chain)}.`,
      );
    }
  };

  for (const chain of switchChainIds) {
    await ensure(chain);
  }

  await ensure(startChain);
}

import { createPublicClient, http, type PublicClient } from "viem";
import { arbitrum, gnosis, mainnet, optimism, polygon } from "viem/chains";
import {
  anvilUrl,
  ensureAnvil,
  getEndpoint,
  getForkBlockNumber,
  isAnvilHealthy,
  killStaleAnvil,
} from "../../../scripts/anvil-config";

export { getForkBlockNumber } from "../../../scripts/anvil-config";

const viemChains = {
  1: mainnet,
  10: optimism,
  100: gnosis,
  137: polygon,
  42161: arbitrum,
};

type ForkChainId = keyof typeof viemChains;

/** How long a fork reset may take before the node counts as wedged. A
 *  warm reset is ~400ms; a cold one pulls the fork's head from DRPC. */
const RESET_TIMEOUT_MS = 20_000;

async function requestReset(
  chainId: ForkChainId,
  blockNumber: number | undefined,
): Promise<boolean> {
  try {
    const res = await fetch(anvilUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "anvil_reset",
        params: [
          {
            forking: {
              jsonRpcUrl: getEndpoint(chainId),
              ...(blockNumber != null && { blockNumber }),
            },
          },
        ],
        id: 1,
      }),
      signal: AbortSignal.timeout(RESET_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { error?: unknown };
    return body.error === undefined;
  } catch {
    return false;
  }
}

/**
 * Re-fork the shared anvil onto a pristine fork of `chainId`: gnosis at the
 * shared bucketed block (see `getForkBlockNumber`), other chains at latest.
 *
 * Self-healing: anvil 1.5.x can wedge while re-forking — alive on the port,
 * RPC silent or serving a head with no block behind it — and without
 * recovery one wedge takes every later test in the package down with it.
 * A reset that times out or leaves the node unhealthy replaces the process
 * and forks again, rather than handing the wedge to the next test.
 */
export async function resetAnvil(
  chainId: ForkChainId = 100,
  blockNumber?: number,
): Promise<PublicClient> {
  const forkBlock = blockNumber ?? (await getForkBlockNumber(chainId));

  let ok = (await requestReset(chainId, forkBlock)) && (await isAnvilHealthy());
  if (!ok) {
    console.warn(
      `anvil: reset to chain ${chainId} failed or left the node unhealthy — replacing the wedged instance`,
    );
    killStaleAnvil();
    await Bun.sleep(300);
    // A fresh node forks gnosis at the bucketed block; the test process
    // must not be kept alive by it, and the runner reuses it as usual.
    const spawned = await ensureAnvil();
    spawned?.unref();
    ok = (await requestReset(chainId, forkBlock)) && (await isAnvilHealthy());
  }
  if (!ok) {
    throw new Error(
      `anvil: could not bring up a healthy fork of chain ${chainId} at ${anvilUrl()}`,
    );
  }

  return createPublicClient({
    chain: viemChains[chainId],
    transport: http(anvilUrl()),
  }) as PublicClient;
}

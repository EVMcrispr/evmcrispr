import { ErrorException, type Module } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { encodeAbiParameters, keccak256 } from "viem";
import { erc20Abi, givpowerAbi } from "../abis";
import {
  GIV_TOKEN,
  GIVPOWER,
  type GivpowerDeployment,
  TOKEN_DISTRO,
} from "../addresses";

export async function requireGivpower(
  module: Module,
): Promise<{ chainId: number; giv: Address; deployment: GivpowerDeployment }> {
  const chainId = await module.getChainId();
  const deployment = GIVPOWER[chainId];
  if (!deployment) {
    throw new ErrorException(
      `GIVpower is not deployed on chain ${chainId} (available on Gnosis, Optimism and Polygon zkEVM)`,
    );
  }
  return { chainId, giv: GIV_TOKEN[chainId]!, deployment };
}

export async function requireDistro(module: Module): Promise<Address> {
  const chainId = await module.getChainId();
  const distro = TOKEN_DISTRO[chainId];
  if (!distro) {
    throw new ErrorException(
      `the GIVstream is not deployed on chain ${chainId} (available on Mainnet, Gnosis, Optimism and Polygon zkEVM)`,
    );
  }
  return distro;
}

/** GIV still locked for `account` at the chain's current time: the sum of
 *  the per-round `roundBalances[r].unlockableTokenAmount` entries for rounds
 *  that haven't finished (r ≥ currentRound, locks end at most 26 rounds
 *  ahead). The per-round mapping has no view, so entries are read straight
 *  from storage via the probed `userLocksSlot`. Locks whose round already
 *  ended are treated as unlocked even before `unlock` is called — unlocking
 *  is permissionless — which also makes the answer time-aware on a fork:
 *  after `wait`, `currentRound()` moves and ended locks drop out. */
export async function stillLockedBalance(
  module: Module,
  deployment: GivpowerDeployment,
  account: Address,
): Promise<bigint> {
  const client = await module.getClient();
  const currentRound = await client.readContract({
    address: deployment.lm,
    abi: givpowerAbi,
    functionName: "currentRound",
  });
  const base = BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [account, deployment.userLocksSlot],
      ),
    ),
  );
  const values = await Promise.all(
    Array.from({ length: 27 }, (_, i) => {
      const round = currentRound + BigInt(i);
      const slot = keccak256(
        encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }],
          [round, base + 1n],
        ),
      );
      return client.getStorageAt({ address: deployment.lm, slot });
    }),
  );
  return values.reduce((acc, v) => acc + (v ? BigInt(v) : 0n), 0n);
}

/** Raw GIV an account has staked: gGIV balance on the garden flavor, the
 *  unipool's deposit-token balance elsewhere. */
export async function stakedBalance(
  module: Module,
  deployment: GivpowerDeployment,
  account: Address,
): Promise<bigint> {
  const client = await module.getClient();
  if (deployment.kind === "garden") {
    return client.readContract({
      address: deployment.gGiv!,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
  }
  return client.readContract({
    address: deployment.lm,
    abi: givpowerAbi,
    functionName: "depositTokenBalance",
    args: [account],
  });
}

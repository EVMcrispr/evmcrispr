import {
  type BatchContext,
  chainLabel,
  ErrorException,
  type Module,
} from "@evmcrispr/sdk";
import type { Address } from "viem";
import { encodeAbiParameters, keccak256 } from "viem";
import type Giveth from "..";
import { erc20Abi, givpowerAbi } from "../abis";
import {
  GIV_TOKEN,
  GIVPOWER,
  type GivpowerDeployment,
  TOKEN_DISTRO,
} from "../addresses";
import { virtualOf } from "./ledger";

export async function requireGivpower(
  module: Module,
): Promise<{ chainId: number; giv: Address; deployment: GivpowerDeployment }> {
  const chainId = await module.getChainId();
  const deployment = GIVPOWER[chainId];
  if (!deployment) {
    throw new ErrorException(
      `GIVpower is not deployed on ${chainLabel(chainId)} (available on Gnosis, Optimism and Polygon zkEVM)`,
    );
  }
  return { chainId, giv: GIV_TOKEN[chainId]!, deployment };
}

export async function requireDistro(module: Module): Promise<Address> {
  const chainId = await module.getChainId();
  const distro = TOKEN_DISTRO[chainId];
  if (!distro) {
    throw new ErrorException(
      `the GIVstream is not deployed on ${chainLabel(chainId)} (available on Mainnet, Gnosis, Optimism and Polygon zkEVM)`,
    );
  }
  return distro;
}

/** Base storage slot of `userLocks[account]` on the lm: slot of the
 *  `totalAmountLocked` struct field; the per-round mapping lives at +1. */
function userLockBaseSlot(
  deployment: GivpowerDeployment,
  account: Address,
): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [account, deployment.userLocksSlot],
      ),
    ),
  );
}

/** `userLocks[account].roundBalances[round].unlockableTokenAmount`. */
export async function roundLockedAmount(
  module: Module,
  deployment: GivpowerDeployment,
  account: Address,
  round: bigint,
): Promise<bigint> {
  const client = await module.getClient();
  const slot = keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      [round, userLockBaseSlot(deployment, account) + 1n],
    ),
  );
  const value = await client.getStorageAt({ address: deployment.lm, slot });
  return value ? BigInt(value) : 0n;
}

/** `userLocks[account].totalAmountLocked`: what the lm counts as locked for
 *  its lock/withdraw checks. Unlike `stillLockedBalance` it keeps counting
 *  ended locks until `unlock` actually runs. */
export async function totalLockedBalance(
  module: Module,
  deployment: GivpowerDeployment,
  account: Address,
): Promise<bigint> {
  const client = await module.getClient();
  const value = await client.getStorageAt({
    address: deployment.lm,
    slot: `0x${userLockBaseSlot(deployment, account).toString(16).padStart(64, "0")}`,
  });
  return value ? BigInt(value) : 0n;
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
  const values = await Promise.all(
    Array.from({ length: 27 }, (_, i) =>
      roundLockedAmount(module, deployment, account, currentRound + BigInt(i)),
    ),
  );
  return values.reduce((acc, v) => acc + v, 0n);
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

// ---------------------------------------------------------------------------
// Virtual-aware balances: on-chain state plus the pending deltas recorded by
// commands whose actions were collected but not executed (see utils/ledger).
// The lm gates lock AND withdraw on `balanceOf − totalAmountLocked`, so
// "lockable" and "unstakable right now" share that bound; `unstakable` stays
// time-aware (stillLocked-based) and counts ended-but-not-unlocked locks.
// ---------------------------------------------------------------------------

const clamp0 = (value: bigint): bigint => (value > 0n ? value : 0n);

/** GIV in the account's wallet, stakeable as GIVpower. */
export async function stakableBalance(
  module: Giveth,
  batchContext: BatchContext | undefined,
  chainId: number,
  giv: Address,
  account: Address,
): Promise<bigint> {
  const client = await module.getClient();
  const balance = await client.readContract({
    address: giv,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
  return clamp0(
    balance + virtualOf(module, batchContext, chainId, account, "giv"),
  );
}

/** Staked GIV the lm accepts for `lock` right now: staked − totalAmountLocked
 *  (ended locks stay locked for this check until `unlock` runs). */
export async function lockableBalance(
  module: Giveth,
  batchContext: BatchContext | undefined,
  chainId: number,
  deployment: GivpowerDeployment,
  account: Address,
): Promise<bigint> {
  const [staked, totalLocked] = await Promise.all([
    stakedBalance(module, deployment, account),
    totalLockedBalance(module, deployment, account),
  ]);
  const vStaked = virtualOf(module, batchContext, chainId, account, "staked");
  const vLocked = virtualOf(module, batchContext, chainId, account, "locked");
  return clamp0(staked + vStaked - (totalLocked + vLocked));
}

/** GIV whose lock round has ended but that still needs a `giveth:unlock`
 *  before the lm lets it be locked again or unstaked. */
export async function unlockableBalance(
  module: Giveth,
  batchContext: BatchContext | undefined,
  chainId: number,
  deployment: GivpowerDeployment,
  account: Address,
): Promise<bigint> {
  const [totalLocked, stillLocked] = await Promise.all([
    totalLockedBalance(module, deployment, account),
    stillLockedBalance(module, deployment, account),
  ]);
  const vUnlocked = virtualOf(
    module,
    batchContext,
    chainId,
    account,
    "unlocked",
  );
  return clamp0(totalLocked - stillLocked - vUnlocked);
}

/** GIV not locked at the current chain time: staked − stillLocked. Ended
 *  locks count as unstakable but need a `giveth:unlock` first. */
export async function unstakableBalance(
  module: Giveth,
  batchContext: BatchContext | undefined,
  chainId: number,
  deployment: GivpowerDeployment,
  account: Address,
): Promise<bigint> {
  const [staked, stillLocked] = await Promise.all([
    stakedBalance(module, deployment, account),
    stillLockedBalance(module, deployment, account),
  ]);
  const vStaked = virtualOf(module, batchContext, chainId, account, "staked");
  const vLocked = virtualOf(module, batchContext, chainId, account, "locked");
  const vUnlocked = virtualOf(
    module,
    batchContext,
    chainId,
    account,
    "unlocked",
  );
  return clamp0(staked + vStaked - (stillLocked + vLocked + vUnlocked));
}

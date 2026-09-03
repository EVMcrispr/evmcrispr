import type { Action, BatchedAction, TransactionAction } from "@evmcrispr/sdk";
import {
  chainIdForName,
  chainLabel,
  clientFor,
  ErrorException,
  isTransactionAction,
} from "@evmcrispr/sdk";
import type { Address } from "viem";
import { encodeFunctionData, getAddress, isAddress } from "viem";
import type Eez from "..";
import { eezBaseAbi } from "../abis";
import { EEZ_CHAINS } from "../constants";

/** The rollup id "on the other side" of a chain: L1 (0) ↔ the rollup (1). */
export function peerRollup(rollupId: bigint): bigint {
  return rollupId === 0n ? 1n : 0n;
}

/** A proxy stands in for a REMOTE address; the registry reverts otherwise. */
export function assertForeignRollup(
  rollupId: bigint,
  own: bigint,
  chainId: number,
): void {
  if (rollupId < 0n) {
    throw new ErrorException(`rollup id must not be negative: ${rollupId}`);
  }
  if (rollupId === own) {
    throw new ErrorException(
      `rollup ${rollupId} is ${chainLabel(chainId)} itself — a cross-chain proxy stands in for a contract on another rollup`,
    );
  }
}

export interface EezConfig {
  chainId: number;
  registry: Address;
  rollupId: bigint;
  peerRollupId: bigint;
  peerChainId?: number;
}

function configAddress(value: unknown): Address | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value);
  if (!isAddress(text)) {
    throw new ErrorException(`$eez:registry is not an address: ${text}`);
  }
  return getAddress(text);
}

function configBigint(value: unknown): bigint | undefined {
  if (value === undefined || value === null) return undefined;
  return BigInt(String(value));
}

/**
 * Where EEZ lives on the current chain: the built-in table for the devnet
 * chains, overridable (or extended to any deployment) with the module's
 * config variables.
 */
export async function eezConfig(module: Eez): Promise<EezConfig> {
  return eezConfigFor(module, await module.getChainId());
}

/** Same for any chain; the config variables only speak for the current one. */
export async function eezConfigFor(
  module: Eez,
  chainId: number,
): Promise<EezConfig> {
  const current = chainId === (await module.getChainId());
  const builtin = EEZ_CHAINS[chainId];
  const registry =
    (current
      ? configAddress(module.getConfigBinding("registry"))
      : undefined) ?? builtin?.registry;
  const rollupId =
    (current ? configBigint(module.getConfigBinding("rollupId")) : undefined) ??
    builtin?.rollupId;
  if (!registry || rollupId === undefined) {
    throw new ErrorException(
      `${chainLabel(chainId)} is not a known EEZ chain — set $eez:registry and $eez:rollupId to use it`,
    );
  }
  const peerRollupId =
    builtin && builtin.rollupId === rollupId
      ? builtin.peerRollupId
      : peerRollup(rollupId);
  return {
    chainId,
    registry,
    rollupId,
    peerRollupId,
    peerChainId: builtin?.peerChainId,
  };
}

/**
 * The rollup a target lives on: the other side of the current chain by
 * default, else what the caller named — a chain (`eezL2`, or its chain
 * id) when the module knows that chain's rollup id, otherwise a bare
 * rollup id.
 */
export function resolveRollup(config: EezConfig, explicit?: unknown): bigint {
  const rollupId =
    explicit === undefined || explicit === null
      ? config.peerRollupId
      : rollupIdFor(explicit);
  assertForeignRollup(rollupId, config.rollupId, config.chainId);
  return rollupId;
}

export function rollupIdFor(value: unknown): bigint {
  const text = String(value);
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return EEZ_CHAINS[n]?.rollupId ?? BigInt(n);
  }
  const chainId = chainIdForName(text);
  const known = chainId !== undefined ? EEZ_CHAINS[chainId] : undefined;
  if (!known) {
    throw new ErrorException(
      `unknown rollup "${text}" — pass a rollup id, or an EEZ chain (eezL1, eezL2)`,
    );
  }
  return known.rollupId;
}

export async function computeProxy(
  module: Eez,
  config: EezConfig,
  target: Address,
  rollupId: bigint,
): Promise<Address> {
  const client = await module.getClient();
  return client.readContract({
    address: config.registry,
    abi: eezBaseAbi,
    functionName: "computeCrossChainProxyAddress",
    args: [target, rollupId],
  });
}

export async function isDeployed(
  module: Eez,
  address: Address,
): Promise<boolean> {
  const client = await module.getClient();
  const code = await client.getCode({ address });
  return !!code && code !== "0x";
}

/** Whether `address` is a cross-chain proxy registered on `chainId`. */
export async function isProxyOn(
  module: Eez,
  chainId: number,
  config: EezConfig,
  address: Address,
): Promise<boolean> {
  const client = await clientFor(module, chainId);
  const [exists] = await client.readContract({
    address: config.registry,
    abi: eezBaseAbi,
    functionName: "authorizedProxies",
    args: [address],
  });
  return exists;
}

export function createProxyAction(
  registry: Address,
  target: Address,
  rollupId: bigint,
): TransactionAction {
  return {
    to: registry,
    value: 0n,
    data: encodeFunctionData({
      abi: eezBaseAbi,
      functionName: "createCrossChainProxy",
      args: [target, rollupId],
    }),
  };
}

/** Human label for the far side of a proxy. */
export function remoteLabel(config: EezConfig, rollupId: bigint): string {
  return rollupId === config.peerRollupId && config.peerChainId !== undefined
    ? chainLabel(config.peerChainId)
    : `rollup ${rollupId}`;
}

/** Gas the registry spends around the remote call on the sending chain:
 *  a bare `setValue` through a proxy used ~105k on L1 in total. */
export const CROSS_CHAIN_OVERHEAD = 250_000n;
/** Floor / ceiling-fallback when the far side can't be simulated. */
const CROSS_CHAIN_MIN_GAS = 300_000n;
export const CROSS_CHAIN_FALLBACK_GAS = 700_000n;

/**
 * Gas limit for a cross-chain call. Neither the execution RPC nor the
 * ingress can estimate it (the proxy only resolves inside a composed sync
 * block), so simulate the remote leg on the far chain when we know it and
 * add the protocol's own overhead; otherwise use a generous constant.
 */
export async function estimateCallGas(
  module: Eez,
  config: EezConfig,
  rollupId: bigint,
  target: Address,
  data: `0x${string}`,
  from: Address,
): Promise<bigint> {
  if (rollupId !== config.peerRollupId || config.peerChainId === undefined) {
    return CROSS_CHAIN_FALLBACK_GAS;
  }
  try {
    const remote = await clientFor(module, config.peerChainId);
    // The far side sees the caller's proxy as msg.sender; the caller
    // itself is close enough for a gas figure and never lacks funds.
    const remoteGas = await remote.estimateGas({
      account: from,
      to: target,
      data,
    });
    const estimate = (remoteGas * 3n) / 2n + CROSS_CHAIN_OVERHEAD;
    return estimate > CROSS_CHAIN_MIN_GAS ? estimate : CROSS_CHAIN_MIN_GAS;
  } catch {
    return CROSS_CHAIN_FALLBACK_GAS;
  }
}

export interface EnsuredProxy {
  proxy: Address;
  rollupId: bigint;
  /** Empty when the proxy already exists on this chain. */
  actions: TransactionAction[];
}

/**
 * Resolve the proxy for `target` on `rollup` and, when nothing is deployed
 * at that address yet, the transaction that creates it.
 */
export async function ensureProxy(
  module: Eez,
  config: EezConfig,
  target: Address,
  rollup?: unknown,
): Promise<EnsuredProxy> {
  const rollupId = resolveRollup(config, rollup);
  const proxy = await computeProxy(module, config, target, rollupId);
  const actions = (await isDeployed(module, proxy))
    ? []
    : [createProxyAction(config.registry, target, rollupId)];
  return { proxy, rollupId, actions };
}

/** A contract call with a target: what a cross-chain proxy can forward. */
export type CrossChainCall = TransactionAction & { to: Address };

/**
 * The actions a cross-chain block may produce: plain contract calls, each
 * of which becomes one call through the target's proxy, and batches of
 * them (kept as batches, so they stay atomic on the sending chain).
 * Switching chain and deploying have no cross-chain meaning.
 */
export function assertCrossChainCalls(
  actions: Action[],
  commandName: string,
): (CrossChainCall | BatchedAction)[] {
  const assertCall = (action: TransactionAction) => {
    if (!action.to) {
      throw new ErrorException(
        `cannot deploy a contract inside ${commandName}: a cross-chain proxy only forwards calls`,
      );
    }
  };
  for (const action of actions) {
    if (isTransactionAction(action)) {
      assertCall(action);
      continue;
    }
    if (action.type === "batched") {
      action.actions.forEach(assertCall);
      continue;
    }
    if (
      action.type === "wallet" &&
      action.method === "wallet_switchEthereumChain"
    ) {
      throw new ErrorException(
        `switch cannot be used inside ${commandName}: the block already runs on the target chain`,
      );
    }
    throw new ErrorException(
      `can't use non-transaction actions inside ${commandName}`,
    );
  }
  return actions as (CrossChainCall | BatchedAction)[];
}

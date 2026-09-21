import type { Module } from "@evmcrispr/sdk";
import { ErrorException, Num } from "@evmcrispr/sdk";
import type { Hex, PublicClient } from "viem";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  isAddressEqual,
  keccak256,
  maxUint256,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
  zeroHash,
} from "viem";
import { COW_SETTLEMENT, COW_VAULT_RELAYER } from "../venues/lib/cowApi";
import type {
  ConditionalOrderParams,
  TwapAdapter,
  TwapReference,
  TwapSchedule,
} from "./types";

// Canonical deployments: https://github.com/cowprotocol/composable-cow#deployed-contracts
export const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
export const TWAP_HANDLER = "0x6cF1e9cA41f7611dEf408122793c358a3d11E5a5";
export const COW_FALLBACK = "0x2f55e8b20D0B9FEFA187AA7d00B6Cbe563605bF5";
export const TIMESTAMP_FACTORY = "0x52eD56Da04309Aca4c3FECC595298d80C2f16BAc";
export { TWAP_DEPLOYMENT_CHAINS as TWAP_CHAINS } from "./networks";

import { TWAP_DEPLOYMENT_CHAINS } from "./networks";
export const MAX_UINT32 = 0xffffffffn;

export const paramsAbi = parseAbiParameters(
  "(address handler, bytes32 salt, bytes staticInput)",
);
export const scheduleAbi = parseAbiParameters(
  "(address sellToken, address buyToken, address receiver, uint256 partSellAmount, uint256 minPartLimit, uint256 t0, uint256 n, uint256 t, uint256 span, bytes32 appData)",
);
export const cowAbi = parseAbi([
  "struct Params { address handler; bytes32 salt; bytes staticInput; }",
  "function create(Params params, bool dispatch)",
  "function createWithContext(Params params, address factory, bytes data, bool dispatch)",
  "function remove(bytes32 singleOrderHash)",
  "function singleOrders(address owner, bytes32 orderHash) view returns (bool)",
  "function cabinet(address owner, bytes32 orderHash) view returns (bytes32)",
  "function roots(address owner) view returns (bytes32)",
  "function swapGuards(address owner) view returns (address)",
  "function domainSeparator() view returns (bytes32)",
  "event ConditionalOrderCreated(address indexed owner, Params params)",
]);

export function integer(value: unknown, label: string): bigint {
  let num: Num;
  try {
    num = Num(value);
  } catch {
    throw new ErrorException(`${label} must be an integer`);
  }
  if (!num.isInteger()) throw new ErrorException(`${label} must be an integer`);
  const result = num.toBigInt();
  if (result < 0n || result > maxUint256)
    throw new ErrorException(`${label} must fit uint256`);
  return result;
}

export function validateSchedule(schedule: TwapSchedule, now?: bigint): void {
  const { sellToken, buyToken, partSellAmount, minPartLimit, t0, n, t, span } =
    schedule;
  if (isAddressEqual(sellToken, buyToken))
    throw new ErrorException("TWAP tokens must be different");
  const native = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  if (
    [sellToken, buyToken].some(
      (token) =>
        isAddressEqual(token, zeroAddress) || isAddressEqual(token, native),
    )
  ) {
    throw new ErrorException(
      "TWAP requires ERC-20 tokens; wrap native tokens first with swaps:wrap",
    );
  }
  if (partSellAmount <= 0n || minPartLimit <= 0n)
    throw new ErrorException("TWAP per-part amounts must be greater than zero");
  if (n < 2n || n > MAX_UINT32)
    throw new ErrorException("--parts must be between 2 and 4294967295");
  if (t < 1n || t > 365n * 86400n)
    throw new ErrorException("--every must be between 1 and 31536000 seconds");
  if (span > t) throw new ErrorException("--window cannot exceed --every");
  if (t0 >= MAX_UINT32)
    throw new ErrorException("--start must be less than 4294967295");
  if (now !== undefined && t0 !== 0n && t0 < now)
    throw new ErrorException("--start must not be in the past");
  const start = t0 || now || 0n;
  const lastValidTo = start + (n - 1n) * t + (span || t) - 1n;
  if (lastValidTo > MAX_UINT32)
    throw new ErrorException("TWAP schedule exceeds CoW's uint32 expiry range");
  if (partSellAmount * n > maxUint256 || minPartLimit * n > maxUint256)
    throw new ErrorException("TWAP total amounts exceed uint256");
}

export function orderHash(params: ConditionalOrderParams): Hex {
  return keccak256(encodeAbiParameters(paramsAbi, [params]));
}

export function decodeSchedule(params: ConditionalOrderParams): TwapSchedule {
  if (!isAddressEqual(params.handler, TWAP_HANDLER))
    throw new ErrorException("Unsupported TWAP handler");
  const [schedule] = decodeAbiParameters(scheduleAbi, params.staticInput);
  validateSchedule(schedule);
  if (
    encodeAbiParameters(scheduleAbi, [schedule]).toLowerCase() !==
    params.staticInput.toLowerCase()
  ) {
    throw new ErrorException("Non-canonical TWAP static input");
  }
  return schedule;
}

export async function requireCode(
  module: Module,
  addresses: readonly `0x${string}`[],
): Promise<void> {
  const client = await module.getClient();
  for (const address of addresses) {
    const code = await client.getCode({ address });
    if (!code || code === "0x")
      throw new ErrorException(
        `TWAP dependency ${address} is not deployed on this chain`,
      );
  }
}

export async function readOrderState(
  client: PublicClient,
  ref: Pick<TwapReference, "account" | "params" | "orderHash">,
  blockNumber?: bigint,
) {
  const schedule = decodeSchedule(ref.params);
  const [registered, cabinet] = await Promise.all([
    client.readContract({
      address: COMPOSABLE_COW,
      abi: cowAbi,
      functionName: "singleOrders",
      args: [ref.account, ref.orderHash],
      blockNumber,
    }),
    client.readContract({
      address: COMPOSABLE_COW,
      abi: cowAbi,
      functionName: "cabinet",
      args: [ref.account, ref.orderHash],
      blockNumber,
    }),
  ]);
  const start = schedule.t0 || BigInt(cabinet);
  return { schedule, registered, start, end: start + schedule.n * schedule.t };
}

export const cowTwap: TwapAdapter = {
  name: "CoWSwap",
  supports: (chainId) => TWAP_DEPLOYMENT_CHAINS.has(chainId),
  async requireDeployment(module) {
    await requireCode(module, [
      COMPOSABLE_COW,
      TWAP_HANDLER,
      COW_FALLBACK,
      TIMESTAMP_FACTORY,
      COW_SETTLEMENT,
      COW_VAULT_RELAYER,
    ]);
  },
  buildParams(schedule, salt) {
    validateSchedule(schedule);
    return {
      handler: TWAP_HANDLER,
      salt,
      staticInput: encodeAbiParameters(scheduleAbi, [schedule]),
    };
  },
  create(params) {
    return {
      to: COMPOSABLE_COW,
      data:
        decodeSchedule(params).t0 === 0n
          ? encodeFunctionData({
              abi: cowAbi,
              functionName: "createWithContext",
              args: [params, TIMESTAMP_FACTORY, "0x", true],
            })
          : encodeFunctionData({
              abi: cowAbi,
              functionName: "create",
              args: [params, true],
            }),
    };
  },
  cancel(hash) {
    return {
      to: COMPOSABLE_COW,
      data: encodeFunctionData({
        abi: cowAbi,
        functionName: "remove",
        args: [hash],
      }),
    };
  },
  async status(client, reference, options) {
    const { twapSnapshot } = await import("./status");
    return (await twapSnapshot(client, reference, options)).status;
  },
};

export const DEFAULT_APP_DATA = zeroHash;

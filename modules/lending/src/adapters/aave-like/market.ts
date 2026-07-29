import type { Module } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { erc20Abi, poolAbi, providerAbi } from "./abis";

/** An Aave-v3-style market: a display name plus the per-chain
 *  PoolAddressesProvider address book that anchors it. */
export interface AaveStyleMarket {
  name: string;
  providers: Record<number, Address>;
}

interface ResolvedMarket {
  pool: Address;
  oracle: Address;
}

// Keyed by market name + chainId; a fork shares its chain's id and resolves
// the same market, so caching across interpreters is safe.
const markets = new Map<string, ResolvedMarket>();

/** Resolve a market's Pool and Oracle through its pinned provider. */
export async function getMarket(
  module: Module,
  market: AaveStyleMarket,
  chainId: number,
): Promise<ResolvedMarket> {
  const key = `${market.name}:${chainId}`;
  const cached = markets.get(key);
  if (cached) return cached;

  const provider = market.providers[chainId];
  if (!provider) {
    throw new ErrorException(
      `${market.name} is not available on chain ${chainId}`,
    );
  }
  const client = await module.getClient();
  const [pool, oracle] = await Promise.all([
    client.readContract({
      address: provider,
      abi: providerAbi,
      functionName: "getPool",
    }),
    client.readContract({
      address: provider,
      abi: providerAbi,
      functionName: "getPriceOracle",
    }),
  ]);
  const resolved = { pool, oracle };
  markets.set(key, resolved);
  return resolved;
}

/** Read a token's reserve data, failing clearly when it is not listed. */
export async function readReserve(
  module: Module,
  market: AaveStyleMarket,
  chainId: number,
  token: Address,
) {
  const { pool } = await getMarket(module, market, chainId);
  const client = await module.getClient();
  const reserve = await client.readContract({
    address: pool,
    abi: poolAbi,
    functionName: "getReserveData",
    args: [token],
  });
  if (reserve.aTokenAddress === zeroAddress) {
    throw new ErrorException(
      `${token} is not listed on ${market.name} on chain ${chainId}`,
    );
  }
  return reserve;
}

/** Current variable debt of `account` in `token`, in base units. */
export async function readVariableDebt(
  module: Module,
  market: AaveStyleMarket,
  chainId: number,
  account: Address,
  token: Address,
): Promise<bigint> {
  const reserve = await readReserve(module, market, chainId, token);
  const client = await module.getClient();
  return client.readContract({
    address: reserve.variableDebtTokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
}

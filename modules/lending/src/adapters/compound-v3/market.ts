import type { Module } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type { CometDeployment } from "../../addresses";
import { COMPOUND_V3 } from "../../addresses";
import { sameAddress } from "../../utils/amounts";
import { cometAbi } from "./abis";

// Base token per comet, read once and cached (a comet's base is immutable).
const baseTokens = new Map<string, Address>();

export function cometsOn(chainId: number): CometDeployment[] {
  const comets = COMPOUND_V3[chainId];
  if (!comets?.length) {
    throw new ErrorException(`CompoundV3 is not available on chain ${chainId}`);
  }
  return comets;
}

export async function baseTokenOf(
  module: Module,
  comet: Address,
): Promise<Address> {
  const key = comet.toLowerCase();
  const cached = baseTokens.get(key);
  if (cached) return cached;
  const client = await module.getClient();
  const base = await client.readContract({
    address: comet,
    abi: cometAbi,
    functionName: "baseToken",
  });
  baseTokens.set(key, base);
  return base;
}

/** The market whose base asset is `token` — the only asset a Comet lends. */
export async function marketForBase(
  module: Module,
  chainId: number,
  token: Address,
): Promise<CometDeployment> {
  const comets = cometsOn(chainId);
  for (const deployment of comets) {
    if (sameAddress(await baseTokenOf(module, deployment.comet), token)) {
      return deployment;
    }
  }
  const bases = comets.map((c) => c.baseSymbol).join(", ");
  throw new ErrorException(
    `${token} is not the base token of a CompoundV3 market on chain ${chainId} (bases: ${bases})`,
  );
}

/**
 * The market that takes `token`: its own base market first, otherwise the
 * first market (in address-book order) listing it as collateral.
 */
export async function marketForToken(
  module: Module,
  chainId: number,
  token: Address,
): Promise<{ deployment: CometDeployment; isBase: boolean }> {
  const comets = cometsOn(chainId);
  for (const deployment of comets) {
    if (sameAddress(await baseTokenOf(module, deployment.comet), token)) {
      return { deployment, isBase: true };
    }
  }
  const client = await module.getClient();
  for (const deployment of comets) {
    try {
      await client.readContract({
        address: deployment.comet,
        abi: cometAbi,
        functionName: "getAssetInfoByAddress",
        args: [token],
      });
      return { deployment, isBase: false };
    } catch {
      // Reverts when the asset is not listed on this comet; try the next.
    }
  }
  throw new ErrorException(
    `${token} is not listed on any CompoundV3 market on chain ${chainId}`,
  );
}

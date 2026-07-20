import { ErrorException, type Module } from "@evmcrispr/sdk";
import type { Address } from "viem";
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

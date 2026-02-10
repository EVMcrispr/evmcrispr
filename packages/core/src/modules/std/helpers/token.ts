import { getAddress, isAddress, zeroAddress } from "viem";
import type { BindingsManager } from "../../../BindingsManager";
import { ErrorException } from "../../../errors";
import type { Module } from "../../../Module";
import type { Address } from "../../../types";
import { BindingsSpace } from "../../../types";
import { defineHelper } from "../../../utils";
import type { Std } from "..";

const ENV_TOKENLIST = "$token.tokenlist";

const getTokenList = async (
  bindingsManager: BindingsManager,
  chainId: number,
): Promise<string> => {
  const tokenList = String(
    bindingsManager.getBindingValue(ENV_TOKENLIST, BindingsSpace.USER) ??
      `https://tokenlist.evmcrispr.com/v0/${chainId}`,
  );

  // Always check user data inputs:
  if (!tokenList.startsWith("https://")) {
    throw new ErrorException(
      `${ENV_TOKENLIST} must be a valid HTTPS URL, got ${tokenList}`,
    );
  }
  return tokenList;
};

export const resolveToken = async (
  module: Module,
  tokenSymbolOrAddress: string,
): Promise<Address> => {
  if (isAddress(tokenSymbolOrAddress)) {
    return tokenSymbolOrAddress;
  }

  // Handle native ETH token symbol
  if (tokenSymbolOrAddress.toUpperCase() === "ETH") {
    return zeroAddress;
  }

  const chainId = await module.getChainId();
  const tokenList = await getTokenList(module.bindingsManager, chainId);
  const {
    tokens,
  }: { tokens: { symbol: string; chainId: number; address: string }[] } =
    await fetch(tokenList).then((r) => r.json());
  const tokenAddress = tokens.find(
    (token) =>
      token.symbol === tokenSymbolOrAddress && token.chainId === chainId,
  )?.address;

  if (!tokenAddress || !isAddress(tokenAddress)) {
    throw new ErrorException(
      `${tokenSymbolOrAddress} not supported in ${tokenList} in chain ${chainId}.`,
    );
  }

  return getAddress(tokenAddress);
};

export default defineHelper<Std>({
  name: "token",
  args: [{ name: "tokenSymbolOrAddress", type: "string" }],
  async run(module, { tokenSymbolOrAddress }) {
    return resolveToken(module, tokenSymbolOrAddress);
  },
});

import fetch from "isomorphic-fetch";

import { getAddress, isAddress, parseAbiItem } from "viem";

import { ErrorException } from "../../../errors";

import type { Address, HelperFunction } from "../../../types";
import { BindingsSpace } from "../../../types";
import {
  ComparisonType,
  checkArgsLength,
  isNumberish,
  toDecimals,
} from "../../../utils";
import type { Module } from "../../../Module";
import type { Std } from "../Std";
import type { BindingsManager } from "../../../BindingsManager";

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

export const _token = async (
  module: Module,
  tokenSymbolOrAddress: string,
): Promise<Address> => {
  if (isAddress(tokenSymbolOrAddress)) {
    return tokenSymbolOrAddress;
  }
  const chainId = await module.getChainId();
  const tokenList = await getTokenList(module.bindingsManager, chainId);
  const {
    tokens,
  }: { tokens: { symbol: string; chainId: number; address: string }[] } =
    await fetch(tokenList).then((r) => r.json());
  const tokenAddress = tokens.find(
    (token) =>
      token.symbol === tokenSymbolOrAddress && token.chainId == chainId,
  )?.address;

  if (!tokenAddress || !isAddress(tokenAddress)) {
    throw new ErrorException(
      `${tokenSymbolOrAddress} not supported in ${tokenList} in chain ${chainId}.`,
    );
  }

  return getAddress(tokenAddress);
};

export const token: HelperFunction<Std> = async (
  module,
  h,
  { interpretNodes },
) => {
  checkArgsLength(h, {
    type: ComparisonType.Equal,
    minValue: 1,
  });
  const [tokenSymbolOrAddress] = await interpretNodes(h.args);

  return _token(module, tokenSymbolOrAddress);
};

export const tokenBalance: HelperFunction<Std> = async (
  module,
  h,
  { interpretNodes },
) => {
  checkArgsLength(h, {
    type: ComparisonType.Equal,
    minValue: 2,
  });

  const [tokenSymbol, holder] = await interpretNodes(h.args);

  const tokenAddr = await _token(module, tokenSymbol);
  const client = await module.getClient();

  const balance = await client.readContract({
    address: tokenAddr,
    abi: [
      parseAbiItem("function balanceOf(address owner) view returns (uint)"),
    ],
    functionName: "balanceOf",
    args: [holder],
  });

  return balance.toString();
};

export const _tokenAmount = async (
  module: Module,
  tokenSymbolOrAddress: string,
  amount: string,
): Promise<string> => {
  const tokenAddr = await _token(module, tokenSymbolOrAddress);

  const client = await module.getClient();
  const decimals = await client.readContract({
    address: tokenAddr,
    abi: [parseAbiItem("function decimals() view returns (uint8)")],
    functionName: "decimals",
  });
  return toDecimals(amount, decimals).toString();
};

export const tokenAmount: HelperFunction<Std> = async (
  module,
  h,
  { interpretNodes },
) => {
  checkArgsLength(h, {
    type: ComparisonType.Equal,
    minValue: 2,
  });
  const [tokenSymbolOrAddress, amount] = await interpretNodes(h.args);

  if (!isNumberish(amount)) {
    throw new ErrorException("amount is not a number");
  }
  return _tokenAmount(module, tokenSymbolOrAddress, amount);
};

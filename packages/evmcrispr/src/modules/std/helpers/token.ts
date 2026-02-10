import { getAddress, isAddress, parseAbiItem, zeroAddress } from "viem";
import type { BindingsManager } from "../../../BindingsManager";
import { ErrorException } from "../../../errors";
import type { Module } from "../../../Module";
import type { Address } from "../../../types";
import { BindingsSpace } from "../../../types";
import { defineHelper, toDecimals } from "../../../utils";
import type { Std } from "../Std";

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

export const token = defineHelper<Std>({
  args: [{ name: "tokenSymbolOrAddress", type: "string" }],
  async run(module, { tokenSymbolOrAddress }) {
    return _token(module, tokenSymbolOrAddress);
  },
});

export const tokenBalance = defineHelper<Std>({
  args: [
    { name: "tokenSymbol", type: "string" },
    { name: "holder", type: "address" },
  ],
  async run(module, { tokenSymbol, holder }) {
    const tokenAddr = await _token(module, tokenSymbol);
    const client = await module.getClient();

    // Handle native ETH balance (zero address)
    if (tokenAddr === zeroAddress) {
      const balance = await client.getBalance({ address: holder });
      return balance.toString();
    }

    const balance = await client.readContract({
      address: tokenAddr,
      abi: [
        parseAbiItem("function balanceOf(address owner) view returns (uint)"),
      ],
      functionName: "balanceOf",
      args: [holder],
    });

    return balance.toString();
  },
});

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

export const tokenAmount = defineHelper<Std>({
  args: [
    { name: "tokenSymbolOrAddress", type: "string" },
    { name: "amount", type: "number" },
  ],
  async run(module, { tokenSymbolOrAddress, amount }) {
    return _tokenAmount(module, tokenSymbolOrAddress, amount);
  },
});

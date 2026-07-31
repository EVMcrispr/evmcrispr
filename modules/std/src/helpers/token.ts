import type { Address, Chain, Module } from "@evmcrispr/sdk";
import {
  chainLabel,
  defineHelper,
  ErrorException,
  readConfigValue,
} from "@evmcrispr/sdk";
import { getAddress, isAddress, zeroAddress } from "viem";
import type Std from "..";

const getTokenList = async (
  module: Module,
  chainId: number,
): Promise<string> => {
  // Always read std's $std:tokenlist, even when called from another module
  // (the token module's helpers resolve symbols through this function).
  const tokenList = String(
    readConfigValue(module.bindingsManager, "std", "tokenlist", { chainId }),
  );

  // Always check user data inputs:
  if (!tokenList.startsWith("https://")) {
    throw new ErrorException(
      `$std:tokenlist must be a valid HTTPS URL, got ${tokenList}`,
    );
  }
  return tokenList;
};

export function getChainNativeCurrency(chain: Chain | undefined) {
  return (
    chain?.nativeCurrency ?? { name: "Ether", symbol: "ETH", decimals: 18 }
  );
}

export const resolveToken = async (
  module: Module,
  tokenSymbolOrAddress: string,
): Promise<Address> => {
  if (isAddress(tokenSymbolOrAddress)) {
    return tokenSymbolOrAddress;
  }

  // Handle SYMBOL:0xAddress format (used when the token list has duplicate symbols)
  const colonIdx = tokenSymbolOrAddress.lastIndexOf(":");
  if (colonIdx !== -1) {
    const addr = tokenSymbolOrAddress.slice(colonIdx + 1);
    if (isAddress(addr)) return getAddress(addr);
  }

  const chainId = await module.getChainId();

  const chain = await module.getChain();
  const nativeCurrency = getChainNativeCurrency(chain);
  if (
    tokenSymbolOrAddress.toUpperCase() === nativeCurrency.symbol.toUpperCase()
  ) {
    return zeroAddress;
  }
  const tokenList = await getTokenList(module, chainId);
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
      `${tokenSymbolOrAddress} not supported in ${tokenList} on ${chainLabel(chainId)}.`,
    );
  }

  return getAddress(tokenAddress);
};

export default defineHelper<Std>({
  name: "token",
  description:
    "Resolve a token symbol to its contract address on the current chain.",
  returnType: "address",
  args: [
    {
      name: "tokenSymbolOrAddress",
      type: "token-symbol",
      description: "Token symbol (e.g. `DAI`) or address",
    },
  ],
  async run(module, { tokenSymbolOrAddress }) {
    return resolveToken(module, tokenSymbolOrAddress);
  },
});

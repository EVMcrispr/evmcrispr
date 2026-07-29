import { defineHelper, ErrorNotFound } from "@evmcrispr/sdk";
import { getAddress, isAddress } from "viem";
import type Superfluid from "..";
import { requireCore } from "../utils/protocol";
import { fetchSuperTokens, tokenListUrl } from "../utils/supertoken";

export default defineHelper<Superfluid>({
  name: "token",
  description:
    "Resolve a SuperToken from the Superfluid token list: by SuperToken symbol (USDCx), or by underlying token address (the USDC address returns USDCx).",
  returnType: "address",
  args: [
    {
      name: "symbolOrUnderlying",
      type: "supertoken",
      description: "SuperToken symbol, or the underlying token's address",
    },
  ],
  async run(module, { symbolOrUnderlying }) {
    const chainId = await requireCore(module);
    const tokens = await fetchSuperTokens(module, chainId);

    if (isAddress(symbolOrUnderlying)) {
      const wanted = getAddress(symbolOrUnderlying);
      const byUnderlying = tokens.find(
        (t) =>
          t.extensions?.superTokenInfo?.underlyingTokenAddress !== undefined &&
          getAddress(t.extensions.superTokenInfo.underlyingTokenAddress) ===
            wanted,
      );
      if (byUnderlying) return getAddress(byUnderlying.address);
      const bySelf = tokens.find((t) => getAddress(t.address) === wanted);
      if (bySelf) return getAddress(bySelf.address);
      throw new ErrorNotFound(
        `no SuperToken wrapping ${wanted} found in ${tokenListUrl(module)} for chain ${chainId}`,
      );
    }

    const bySymbol = tokens.find((t) => t.symbol === symbolOrUnderlying);
    if (bySymbol) return getAddress(bySymbol.address);
    throw new ErrorNotFound(
      `SuperToken ${symbolOrUnderlying} not found in ${tokenListUrl(module)} for chain ${chainId}`,
    );
  },
});

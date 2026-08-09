import { chainLabel, defineHelper, ErrorNotFound } from "@evmcrispr/sdk";
import { getAddress, isAddress } from "viem";
import type Superfluid from "..";
import { requireCore } from "../utils/protocol";
import { fetchSuperTokens, tokenListUrl } from "../utils/supertoken";

export default defineHelper<Superfluid>({
  name: "token",
  description:
    "Resolve a SuperToken from the Superfluid token list: by SuperToken symbol (USDCx), or by underlying token address (the USDC address returns USDCx). As @token! the token-list resolution still happens at composition time and the resolved SuperToken address folds into the expression as a constant — pair it with @underlying! for a live on-chain check.",
  returnType: "address",
  args: [
    {
      name: "symbolOrUnderlying",
      type: "supertoken",
      description: "SuperToken symbol, or the address of the underlying token",
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
        `no SuperToken wrapping ${wanted} found in ${tokenListUrl(module)} for ${chainLabel(chainId)}`,
      );
    }

    const bySymbol = tokens.find((t) => t.symbol === symbolOrUnderlying);
    if (bySymbol) return getAddress(bySymbol.address);
    throw new ErrorNotFound(
      `SuperToken ${symbolOrUnderlying} not found in ${tokenListUrl(module)} for ${chainLabel(chainId)}`,
    );
  },
  compile: async (ctx, node) => {
    // The token list is an off-chain service: resolution happens at
    // composition time (exactly like the run face) and the address
    // participates in the on-chain expression as a build-time constant.
    const symbolOrUnderlying = String(
      await ctx.interpreters.interpretNode(node.args[0]),
    );
    const chainId = await requireCore(ctx.module);
    const tokens = await fetchSuperTokens(ctx.module, chainId);
    let resolved: string | undefined;
    if (isAddress(symbolOrUnderlying)) {
      const wanted = getAddress(symbolOrUnderlying);
      resolved = (
        tokens.find(
          (t) =>
            t.extensions?.superTokenInfo?.underlyingTokenAddress !==
              undefined &&
            getAddress(t.extensions.superTokenInfo.underlyingTokenAddress) ===
              wanted,
        ) ?? tokens.find((t) => getAddress(t.address) === wanted)
      )?.address;
    } else {
      resolved = tokens.find((t) => t.symbol === symbolOrUnderlying)?.address;
    }
    if (!resolved) {
      throw new ErrorNotFound(
        `SuperToken ${symbolOrUnderlying} not found in ${tokenListUrl(ctx.module)} for ${chainLabel(chainId)}`,
      );
    }
    return { kind: "const", cat: "Address", value: getAddress(resolved) };
  },
});

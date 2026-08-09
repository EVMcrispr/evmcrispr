import { getChainNativeCurrency, resolveToken } from "@evmcrispr/module-std";
import { defineHelper } from "@evmcrispr/sdk";
import { staticCallParam } from "@evmcrispr/sdk/onchain";
import { parseAbiItem, toFunctionSelector, zeroAddress } from "viem";
import type Token from "..";

export default defineHelper<Token>({
  name: "symbol",
  description:
    "Return the symbol of a token. As @symbol! the token resolves at composition time and symbol() is read on-chain at assertion time as a String operand — digest-judged like the other string faces, and composable with them (e.g. `@str.lower!(@token:symbol!(DAI))`); the native token folds to its constant symbol.",
  returnType: "string",
  args: [
    {
      name: "tokenSymbol",
      type: "token-symbol",
      description: "Token address (or symbol)",
    },
  ],
  async run(module, { tokenSymbol }) {
    const tokenAddr = await resolveToken(module, tokenSymbol);

    if (tokenAddr === zeroAddress) {
      const chain = await module.getChain();
      return getChainNativeCurrency(chain).symbol;
    }

    const client = await module.getClient();
    return client.readContract({
      address: tokenAddr,
      abi: [parseAbiItem("function symbol() view returns (string)")],
      functionName: "symbol",
    });
  },
  compile: async (ctx, node) => {
    const symbol = await ctx.interpreters.interpretNode(node.args[0]);
    const tokenAddr = await resolveToken(ctx.module, String(symbol));
    if (tokenAddr === zeroAddress) {
      const chain = await ctx.module.getChain();
      return {
        kind: "const",
        cat: "String",
        value: getChainNativeCurrency(chain).symbol,
      };
    }
    // A plain staticcall String operand: top-level and nested == / !=
    // judge it by keccak digest of the decoded payload, and the string
    // faces splice its envelope (e.g. @str.lower!(@token:symbol!(DAI))).
    return {
      kind: "call",
      param: staticCallParam(
        tokenAddr,
        toFunctionSelector("function symbol()"),
      ),
      cat: "String",
    };
  },
});

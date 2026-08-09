import { defineHelper } from "@evmcrispr/sdk";
import { staticCallParam } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData } from "viem";
import type Superfluid from "..";
import { superTokenAbi } from "../abis";
import { compileSuperToken } from "../utils/onchain";
import { requireCore } from "../utils/protocol";
import { getUnderlyingToken, resolveSuperToken } from "../utils/supertoken";

export default defineHelper<Superfluid>({
  name: "underlying",
  batchable: false,
  description:
    "Underlying ERC-20 of a SuperToken (the zero address for native-asset SuperTokens like ETHx or xDAIx). As @underlying! the getUnderlyingToken() read happens on-chain at assertion time (the SuperToken still resolves at composition time).",
  returnType: "address",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol or address",
    },
  ],
  async run(module, { token }) {
    await requireCore(module);
    const superToken = await resolveSuperToken(module, token);
    return getUnderlyingToken(module, superToken);
  },
  compile: async (ctx, node) => {
    await requireCore(ctx.module);
    // The argument may be a symbol/address literal or a nested
    // composition-time face like @token! (which folds to a constant).
    const superToken = await compileSuperToken(
      ctx,
      node.args[0],
      "@underlying!",
    );
    return {
      kind: "call",
      param: staticCallParam(
        superToken,
        encodeFunctionData({
          abi: superTokenAbi,
          functionName: "getUnderlyingToken",
        }),
      ),
      cat: "Address",
    };
  },
});

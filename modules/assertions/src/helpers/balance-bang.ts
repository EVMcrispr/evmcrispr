import { resolveToken } from "@evmcrispr/module-std";
import { ErrorException, NodeType } from "@evmcrispr/sdk";
import { getAddress, isAddress, zeroAddress } from "viem";
import type { Operand } from "../lib/compiler";
import { chainParam, coreCall, requireChainArg } from "../lib/compiler";
import { encodeOpRead } from "../lib/core";
import { balanceParam } from "../lib/erc8211";
import { OP_SELECTORS } from "../lib/operators";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "balance!",
  description:
    "Read a balance on-chain at assertion time: the native balance for ETH, or an ERC-20 balanceOf for any token symbol or address.",
  returnType: "number",
  args: [
    {
      name: "token",
      type: "token-symbol",
      description:
        "ETH (native) or a token symbol/address resolved like @token",
    },
    {
      name: "account",
      type: "address",
      description:
        "Account address, or (native only) a `::` call resolving to one",
    },
  ],
  compileAssert: async (ctx, node): Promise<Operand> => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@balance! expects (token account), e.g. @balance!(ETH @me) or @balance!(WETH @me)",
      );
    }
    const [tokenNode, accountNode] = node.args;
    const tokenValue = await ctx.interpreters.interpretNode(tokenNode);
    const tokenAddr = await resolveToken(
      ctx.module as never,
      String(tokenValue),
    );
    const native = tokenAddr === zeroAddress;

    if (accountNode.type === NodeType.CallExpression) {
      if (!native) {
        throw new ErrorException(
          "@balance! with a call-resolved account only supports the native token (ETH) — the BALANCE fetcher needs a literal account address",
        );
      }
      const chain = await requireChainArg(ctx, "balance!", accountNode);
      const out = chain.lastAbi.outputs?.[0];
      if (chain.lastAbi.outputs?.length !== 1 || out?.type !== "address") {
        throw new ErrorException(
          "@balance! account call must return a single address",
        );
      }
      // Runtime account: the core's read splices the resolved address
      // word into balance(address).
      return coreCall(
        ctx,
        encodeOpRead(ctx.operators, OP_SELECTORS.balance, [
          chainParam(ctx, chain),
        ]),
        "Uint",
      );
    }

    const account = await ctx.interpreters.interpretNode(accountNode);
    if (typeof account !== "string" || !isAddress(account)) {
      throw new ErrorException(
        `@balance! account must resolve to an address, got ${account}`,
      );
    }
    // Native and ERC-20 both map onto the ERC-8211 BALANCE fetcher
    // (token == 0 reads the native balance).
    return {
      kind: "call",
      param: balanceParam(tokenAddr, getAddress(account)),
      cat: "Uint",
    };
  },
});

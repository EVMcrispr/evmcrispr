import { resolveToken } from "@evmcrispr/module-std";
import { ErrorException, NodeType } from "@evmcrispr/sdk";
import {
  encodeFunctionData,
  getAddress,
  isAddress,
  parseAbi,
  zeroAddress,
} from "viem";
import { encodeEnv, encodeUnary } from "../lib/combinators";
import type { Operand } from "../lib/compiler";
import {
  chainCallPair,
  combinatorCall,
  requireChainArg,
} from "../lib/compiler";
import { defineBangHelper } from "./_bang";

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

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
          "@balance! with a call-resolved account only supports the native token (ETH) — the combinators contract cannot route a resolved address into balanceOf",
        );
      }
      const chain = await requireChainArg(ctx, "balance!", accountNode);
      const out = chain.lastAbi.outputs?.[0];
      if (chain.lastAbi.outputs?.length !== 1 || out?.type !== "address") {
        throw new ErrorException(
          "@balance! account call must return a single address",
        );
      }
      return combinatorCall(
        ctx,
        encodeUnary("Balance", chainCallPair(ctx, chain)),
        "Uint",
      );
    }

    const account = await ctx.interpreters.interpretNode(accountNode);
    if (typeof account !== "string" || !isAddress(account)) {
      throw new ErrorException(
        `@balance! account must resolve to an address, got ${account}`,
      );
    }
    if (native) {
      return combinatorCall(
        ctx,
        encodeEnv("Balance", BigInt(getAddress(account))),
        "Uint",
      );
    }
    return {
      kind: "call",
      target: tokenAddr,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [getAddress(account)],
      }),
      cat: "Uint",
    };
  },
});

import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import {
  balanceParam,
  chainParam,
  coreCall,
  encodeOpRead,
  OP_SELECTORS,
  requireChainArg,
} from "@evmcrispr/sdk/onchain";
import { getAddress, isAddress, parseAbiItem, zeroAddress } from "viem";
import type Std from "..";
import { resolveToken } from "./token";

export default defineHelper<Std>({
  name: "balance",
  batchable: false,
  description:
    "Fetch a balance in base units: the native balance for ETH, or an ERC-20 balanceOf for any token symbol or address. As @balance! the balance is read on-chain at assertion time instead of script build time.",
  returnType: "number",
  args: [
    {
      name: "token",
      type: "token-symbol",
      description:
        "ETH (native) or a token symbol/address resolved like @token",
    },
    {
      name: "holder",
      type: "address",
      description:
        "Account address, or (@balance! with native ETH only) a `::` call resolving to one",
    },
  ],
  async run(module, { token, holder }) {
    const tokenAddr = await resolveToken(module, token);
    const client = await module.getClient();

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
  compile: async (ctx, node): Promise<Operand> => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@balance! expects (token account), e.g. @balance!(ETH @me) or @balance!(WETH @me)",
      );
    }
    const [tokenNode, accountNode] = node.args;
    const tokenValue = await ctx.interpreters.interpretNode(tokenNode);
    const tokenAddr = await resolveToken(ctx.module, String(tokenValue));
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

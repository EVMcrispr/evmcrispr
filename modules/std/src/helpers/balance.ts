import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import {
  balanceParam,
  callReadOperand,
  chainParam,
  coreCall,
  encodeOpRead,
  isLiveArg,
  OP_SELECTORS,
  readTarget,
  requireChainArg,
} from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAddress, isAddress, parseAbiItem, zeroAddress } from "viem";
import type Std from "..";
import { resolveToken } from "./token";

const BALANCE_OF_ABI = parseAbiItem(
  "function balanceOf(address) view returns (uint256)",
) as AbiFunction;

export default defineHelper<Std>({
  name: "balance",
  batchable: false,
  description:
    "Balance in base units: the native balance for ETH, or an ERC-20 balanceOf for any token symbol or address.",
  compileDescription:
    "The token and the holder may each be a `::!` call resolving to an address.",
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
      description: "Account address",
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
    const token = await readTarget(ctx, "balance!", tokenNode, (value) =>
      resolveToken(ctx.module, String(value)),
    );
    const native = token === zeroAddress;

    // A live token, or a live account of an ERC-20: the BALANCE fetcher
    // takes both as literals, so the read is the token's own
    // balanceOf(account), constructed when the assertion runs.
    if (typeof token !== "string" || (!native && isLiveArg(accountNode))) {
      return callReadOperand(ctx, token, BALANCE_OF_ABI, [accountNode], "Uint");
    }
    const tokenAddr = token;

    if (accountNode.type === NodeType.CallExpression) {
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

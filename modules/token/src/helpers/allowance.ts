import { resolveToken } from "@evmcrispr/module-std";
import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  buildCallSegments,
  compileArgSpecs,
  encodeRead,
  rawParam,
  staticCallParam,
  toWord,
} from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { encodeFunctionData, parseAbiItem, zeroAddress } from "viem";
import type Token from "..";

const ALLOWANCE_ABI = parseAbiItem(
  "function allowance(address owner, address spender) view returns (uint256)",
) as AbiFunction;

export default defineHelper<Token>({
  name: "allowance",
  batchable: false,
  description: "Allowance an owner has granted to a spender, in base units.",
  returnType: "number",
  args: [
    {
      name: "tokenSymbol",
      type: "token-symbol",
      description: "Token symbol (e.g. `DAI`) or address",
    },
    { name: "owner", type: "address", description: "Owner address" },
    { name: "spender", type: "address", description: "Spender address" },
  ],
  async run(module, { tokenSymbol, owner, spender }) {
    const tokenAddr = await resolveToken(module, tokenSymbol);

    if (tokenAddr === zeroAddress) {
      throw new ErrorException("the native token has no allowances");
    }

    const client = await module.getClient();
    const allowance = await client.readContract({
      address: tokenAddr,
      abi: [
        parseAbiItem(
          "function allowance(address owner, address spender) view returns (uint256)",
        ),
      ],
      functionName: "allowance",
      args: [owner, spender],
    });

    return allowance.toString();
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 3) {
      throw new ErrorException(
        "@allowance! expects (token owner spender), e.g. @allowance!(DAI @me $spender)",
      );
    }
    const symbol = await ctx.interpreters.interpretNode(node.args[0]);
    const tokenAddr = await resolveToken(ctx.module, String(symbol));
    if (tokenAddr === zeroAddress) {
      throw new ErrorException("the native token has no allowances");
    }
    // Owner/spender ride the shared arg machinery: literal addresses
    // compile to plain calldata, live calls fold into a core read splice.
    const specs = await compileArgSpecs(
      ctx,
      node.args.slice(1),
      ALLOWANCE_ABI,
      "allowance",
    );
    if (specs.every((s) => s.kind === "value")) {
      return {
        kind: "call",
        param: staticCallParam(
          tokenAddr,
          encodeFunctionData({
            abi: [ALLOWANCE_ABI],
            functionName: "allowance",
            args: specs.map((s) => (s as { value: unknown }).value) as never,
          }),
        ),
        cat: "Uint",
      };
    }
    const call = buildCallSegments(ALLOWANCE_ABI, specs);
    return {
      kind: "call",
      param: staticCallParam(
        ctx.core,
        encodeRead(
          rawParam(toWord(BigInt(tokenAddr))),
          call.selector,
          call.segments,
        ),
      ),
      cat: "Uint",
    };
  },
});

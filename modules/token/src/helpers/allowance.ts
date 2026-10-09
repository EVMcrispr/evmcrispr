import { resolveToken } from "@evmcrispr/module-std";
import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { callReadOperand, readTarget } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { parseAbiItem, zeroAddress } from "viem";
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
    const token = await readTarget(ctx, "allowance!", node.args[0], (value) =>
      resolveToken(ctx.module, String(value)),
    );
    if (token === zeroAddress) {
      throw new ErrorException("the native token has no allowances");
    }
    // The token, the owner and the spender may each be live: literal
    // values compile to plain calldata, live ones fold into a core read.
    return callReadOperand(
      ctx,
      token,
      ALLOWANCE_ABI,
      node.args.slice(1),
      "Uint",
    );
  },
});

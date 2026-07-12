import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { parseAbiItem, zeroAddress } from "viem";
import type Std from "..";
import { resolveToken } from "./token";

export default defineHelper<Std>({
  name: "token.allowance",
  batchable: false,
  description:
    "Fetch the allowance an owner has granted to a spender, in base units.",
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
});

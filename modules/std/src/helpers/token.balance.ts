import { defineHelper } from "@evmcrispr/sdk";
import { parseAbiItem, zeroAddress } from "viem";
import type Std from "..";
import { resolveToken } from "./token";

export default defineHelper<Std>({
  name: "token.balance",
  description: "Fetch the token balance of an address in base units.",
  returnType: "number",
  args: [
    { name: "tokenSymbol", type: "token-symbol" },
    { name: "holder", type: "address", description: "Address to query" },
  ],
  async run(module, { tokenSymbol, holder }) {
    const tokenAddr = await resolveToken(module, tokenSymbol);
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
});

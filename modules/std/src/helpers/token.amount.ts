import { defineHelper, toDecimals } from "@evmcrispr/sdk";
import { parseAbiItem } from "viem";
import type Std from "..";
import { resolveToken } from "./token";

export default defineHelper<Std>({
  name: "token.amount",
  description:
    "Convert a human-readable token amount to its base unit (applying decimals).",
  returnType: "number",
  args: [
    { name: "tokenSymbolOrAddress", type: "string" },
    { name: "amount", type: "number" },
  ],
  async run(module, { tokenSymbolOrAddress, amount }) {
    const tokenAddr = await resolveToken(module, tokenSymbolOrAddress);

    const client = await module.getClient();
    const decimals = await client.readContract({
      address: tokenAddr,
      abi: [parseAbiItem("function decimals() view returns (uint8)")],
      functionName: "decimals",
    });
    return toDecimals(amount, decimals).toString();
  },
});

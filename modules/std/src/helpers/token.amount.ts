import { ErrorException, defineHelper } from "@evmcrispr/sdk";
import { parseAbiItem, parseUnits, zeroAddress } from "viem";
import type Std from "..";
import { resolveToken } from "./token";

const AMOUNT_RE = /^\d+(\.\d+)?$/;

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

    // Handle native ETH balance (zero address)
    if (tokenAddr === zeroAddress) {
      return parseUnits(String(amount), 18).toString();
    }

    const client = await module.getClient();
    const decimals = await client.readContract({
      address: tokenAddr,
      abi: [parseAbiItem("function decimals() view returns (uint8)")],
      functionName: "decimals",
    });
    return parseUnits(String(amount), decimals).toString();
  },
});

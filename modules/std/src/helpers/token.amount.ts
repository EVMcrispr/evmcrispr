import { ErrorException, defineHelper } from "@evmcrispr/sdk";
import { parseAbiItem, parseUnits } from "viem";
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
    { name: "amount", type: "string" },
  ],
  async run(module, { tokenSymbolOrAddress, amount }) {
    const amountStr = String(amount);
    if (!AMOUNT_RE.test(amountStr)) {
      throw new ErrorException(
        `<amount> must be a number (e.g. "100" or "0.5"), got ${amountStr}`,
      );
    }

    const tokenAddr = await resolveToken(module, tokenSymbolOrAddress);

    const client = await module.getClient();
    const decimals = await client.readContract({
      address: tokenAddr,
      abi: [parseAbiItem("function decimals() view returns (uint8)")],
      functionName: "decimals",
    });
    return parseUnits(amountStr, decimals).toString();
  },
});

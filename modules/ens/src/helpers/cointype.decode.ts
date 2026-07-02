import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import type Ens from "..";
import { chainNameOf } from "../argTypes";

export default defineHelper<Ens>({
  name: "cointype.decode",
  description:
    "Chain name of an ENSIP-11 coin type (the inverse of @cointype).",
  returnType: "string",
  args: [
    {
      name: "coinType",
      type: "number",
      description: "ENSIP-11 coin type (e.g. 60, 2147483658)",
    },
  ],
  async run(_, { coinType }, { node }) {
    const value = Number(String(coinType));
    if (value === 60) return "mainnet";
    if (value < 0x80000000 || value > 0xffffffff) {
      throw new HelperFunctionError(
        node,
        `coin type ${value} is not an ENSIP-11 EVM coin type`,
      );
    }
    const chainId = value & 0x7fffffff;
    return chainNameOf(chainId) ?? String(chainId);
  },
});

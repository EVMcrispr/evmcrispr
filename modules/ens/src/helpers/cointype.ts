import { defineHelper, Num } from "@evmcrispr/sdk";
import type Ens from "..";
import { resolveChainId } from "../argTypes";

// SLIP-44 coin type for ETH; every other EVM chain derives its coin type
// from the chain id per ENSIP-11.
const ETH_COIN_TYPE = 60;

export default defineHelper<Ens>({
  name: "cointype",
  description:
    "ENSIP-11 coin type of an EVM chain, for multichain address records.",
  returnType: "number",
  args: [
    {
      name: "chain",
      type: "chain",
      optional: true,
      description:
        "Chain name or id (e.g. optimism, 10); defaults to the connected chain",
    },
  ],
  async run(module, { chain }) {
    const chainId =
      chain !== undefined
        ? resolveChainId(String(chain))
        : await module.getChainId();
    const coinType =
      chainId === 1 ? ETH_COIN_TYPE : (0x80000000 | chainId) >>> 0;
    return Num.fromBigInt(BigInt(coinType));
  },
});

import { defineHelper, Num } from "@evmcrispr/sdk";
import { parseAbi } from "viem";
import { mainnet } from "viem/chains";
import type Ens from "..";
import { ethRegistrarControllerMap, requireAddress } from "../addresses";
import { eth2LDLabel, mainnetClient } from "../utils";

export const rentPriceAbi = parseAbi([
  "struct Price { uint256 base; uint256 premium; }",
  "function rentPrice(string label, uint256 duration) view returns (Price price)",
]);

export default defineHelper<Ens>({
  name: "ens.rentPrice",
  batchable: false,
  description:
    "Total price in wei to register or renew a .eth name for a duration.",
  returnType: "number",
  args: [
    {
      name: "name",
      type: "string",
      description: ".eth name or label (e.g. vitalik.eth or vitalik)",
    },
    {
      name: "duration",
      type: "number",
      description: "Duration in seconds",
    },
  ],
  async run(module, { name, duration }) {
    const label = name.includes(".") ? eth2LDLabel(name) : name;
    const client = mainnetClient(module);
    const price = await client.readContract({
      address: requireAddress(
        ethRegistrarControllerMap,
        mainnet.id,
        "ETHRegistrarController",
      ),
      abi: rentPriceAbi,
      functionName: "rentPrice",
      args: [label, BigInt(duration)],
    });
    return Num.fromBigInt(price.base + price.premium);
  },
});

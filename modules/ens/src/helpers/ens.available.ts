import { defineHelper } from "@evmcrispr/sdk";
import { parseAbi } from "viem";
import { mainnet } from "viem/chains";
import type Ens from "..";
import { ethRegistrarControllerMap, requireAddress } from "../addresses";
import { eth2LDLabel, mainnetClient } from "../utils";

export default defineHelper<Ens>({
  name: "ens.available",
  batchable: false,
  description: "Check whether a .eth name is available for registration.",
  returnType: "bool",
  args: [
    {
      name: "name",
      type: "string",
      description: ".eth name or label (e.g. vitalik.eth or vitalik)",
    },
  ],
  async run(module, { name }) {
    const label = name.includes(".") ? eth2LDLabel(name) : name;
    const client = mainnetClient(module);
    return client.readContract({
      address: requireAddress(
        ethRegistrarControllerMap,
        mainnet.id,
        "ETHRegistrarController",
      ),
      abi: parseAbi(["function available(string label) view returns (bool)"]),
      functionName: "available",
      args: [label],
    });
  },
});

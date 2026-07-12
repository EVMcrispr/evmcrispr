import { defineHelper, HelperFunctionError, Num } from "@evmcrispr/sdk";
import { labelhash, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import type Ens from "..";
import { baseRegistrarMap, requireAddress } from "../addresses";
import { eth2LDLabel, mainnetClient } from "../utils";

export default defineHelper<Ens>({
  name: "expiry",
  batchable: false,
  description: "Registration expiry timestamp of a .eth name.",
  returnType: "number",
  args: [
    {
      name: "name",
      type: "string",
      description: ".eth second-level name (e.g. vitalik.eth)",
    },
  ],
  async run(module, { name }, { node }) {
    const label = eth2LDLabel(name);
    const client = mainnetClient(module);
    const expiry = await client.readContract({
      address: requireAddress(baseRegistrarMap, mainnet.id, "BaseRegistrar"),
      abi: parseAbi([
        "function nameExpires(uint256 id) view returns (uint256)",
      ]),
      functionName: "nameExpires",
      args: [BigInt(labelhash(label))],
    });
    if (expiry === 0n) {
      throw new HelperFunctionError(node, `${name} is not registered`);
    }
    return Num.fromBigInt(expiry);
  },
});

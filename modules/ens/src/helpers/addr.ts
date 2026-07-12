import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { normalize } from "viem/ens";
import type Ens from "..";
import { mainnetClient } from "../utils";

export default defineHelper<Ens>({
  name: "addr",
  batchable: false,
  description: "Resolve an ENS name to an address, optionally per coin type.",
  returnType: "address",
  args: [
    {
      name: "name",
      type: "string",
      description: "ENS name (e.g. vitalik.eth)",
    },
    {
      name: "coinType",
      type: "number",
      optional: true,
      description: "ENSIP-9/11 coin type (defaults to 60, ETH)",
    },
  ],
  async run(module, { name, coinType }, { node }) {
    const client = mainnetClient(module);
    const address = await client.getEnsAddress({
      name: normalize(name),
      ...(coinType !== undefined ? { coinType: BigInt(String(coinType)) } : {}),
    });
    if (!address) {
      throw new HelperFunctionError(node, `no address found for ${name}`);
    }
    return address;
  },
});

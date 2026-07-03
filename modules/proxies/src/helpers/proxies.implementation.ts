import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import type Proxies from "..";
import {
  BEACON_SLOT,
  beaconAbi,
  IMPLEMENTATION_SLOT,
  readSlotAddress,
} from "../utils";

export default defineHelper<Proxies>({
  name: "proxies.implementation",
  batchable: false,
  description:
    "Implementation address of an ERC-1967 proxy, following the beacon when the proxy is a beacon proxy.",
  returnType: "address",
  args: [{ name: "proxy", type: "address", description: "Proxy address" }],
  async run(module, { proxy }, { node }) {
    const client = await module.getClient();

    const implementation = await readSlotAddress(
      client,
      proxy,
      IMPLEMENTATION_SLOT,
    );
    if (implementation) return implementation;

    const beacon = await readSlotAddress(client, proxy, BEACON_SLOT);
    if (beacon) {
      return client.readContract({
        address: beacon,
        abi: beaconAbi,
        functionName: "implementation",
      });
    }

    throw new HelperFunctionError(
      node,
      `${proxy} is not an ERC-1967 proxy (its implementation and beacon slots are empty)`,
    );
  },
});

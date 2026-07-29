import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import type Proxies from "..";
import { BEACON_SLOT, readSlotAddress } from "../utils";

export default defineHelper<Proxies>({
  name: "beacon",
  batchable: false,
  description: "Beacon address of an ERC-1967 beacon proxy.",
  returnType: "address",
  args: [{ name: "proxy", type: "address", description: "Proxy address" }],
  async run(module, { proxy }, { node }) {
    const client = await module.getClient();
    const beacon = await readSlotAddress(client, proxy, BEACON_SLOT);
    if (!beacon) {
      throw new HelperFunctionError(
        node,
        `${proxy} has no ERC-1967 beacon (not a beacon proxy)`,
      );
    }
    return beacon;
  },
});

import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import type Proxies from "..";
import { ADMIN_SLOT, readSlotAddress } from "../utils";

export default defineHelper<Proxies>({
  name: "proxies.admin",
  batchable: false,
  description:
    "Admin of a transparent ERC-1967 proxy (the ProxyAdmin contract on OpenZeppelin v5 proxies).",
  returnType: "address",
  args: [{ name: "proxy", type: "address", description: "Proxy address" }],
  async run(module, { proxy }, { node }) {
    const client = await module.getClient();
    const admin = await readSlotAddress(client, proxy, ADMIN_SLOT);
    if (!admin) {
      throw new HelperFunctionError(
        node,
        `${proxy} has no ERC-1967 admin (not a transparent proxy)`,
      );
    }
    return admin;
  },
});

import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { callReadOperand, readTarget } from "@evmcrispr/sdk/onchain";
import { type AbiFunction, parseAbiItem } from "viem";
import type Proxies from "..";
import { ADMIN_SLOT, readSlotAddress } from "../utils";

export default defineHelper<Proxies>({
  name: "admin",
  batchable: false,
  description:
    "Admin of a transparent ERC-1967 proxy (the ProxyAdmin contract on OpenZeppelin v5 proxies).",
  compileDescription:
    "Calls `admin()` on the proxy, not the ERC-1967 slot: it reverts where the proxy hides it and trusts what the proxy answers.",
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
  compile: async (ctx, node) =>
    callReadOperand(
      ctx,
      await readTarget(ctx, "admin!", node.args[0]),
      parseAbiItem("function admin() view returns (address)") as AbiFunction,
      [],
      "Address",
    ),
});

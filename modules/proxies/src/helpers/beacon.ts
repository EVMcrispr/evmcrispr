import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { callReadOperand, readTarget } from "@evmcrispr/sdk/onchain";
import { type AbiFunction, parseAbiItem } from "viem";
import type Proxies from "..";
import { BEACON_SLOT, readSlotAddress } from "../utils";

export default defineHelper<Proxies>({
  name: "beacon",
  batchable: false,
  description: "Beacon address of an ERC-1967 beacon proxy.",
  compileDescription:
    "Calls `beacon()` on the proxy, not the ERC-1967 slot: it reverts where the proxy hides it and trusts what the proxy answers.",
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
  compile: async (ctx, node) =>
    callReadOperand(
      ctx,
      await readTarget(ctx, "beacon!", node.args[0]),
      parseAbiItem("function beacon() view returns (address)") as AbiFunction,
      [],
      "Address",
    ),
});

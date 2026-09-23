import { defineHelper } from "@evmcrispr/sdk";
import { isAddressEqual } from "viem";
import type Safe from "..";
import { getOwners } from "../utils";
import { getDelegates } from "../utils/txService";

export default defineHelper<Safe>({
  name: "delegates",
  description:
    "Accounts the Safe Transaction Service lets propose transactions of a Safe on behalf of its owners, without confirming them.",
  returnType: "array",
  batchable: false,
  args: [
    {
      name: "safe",
      type: "address",
      optional: true,
      description:
        "Safe address (defaults to the context Safe or connected account)",
    },
  ],
  async run(module, { safe }) {
    const address = await module.resolveSafe(safe);
    const chainId = await module.getChainId();
    const owners = await getOwners(await module.getClient(), address);
    const delegates: string[] = [];
    for (const delegator of owners)
      for (const d of await getDelegates(module, chainId, { delegator }))
        if (
          (d.safe === null || isAddressEqual(d.safe, address)) &&
          (d.expiryDate === null || Date.parse(d.expiryDate) > Date.now()) &&
          !delegates.some((a) => isAddressEqual(a as never, d.delegate))
        )
          delegates.push(d.delegate);
    return delegates;
  },
});

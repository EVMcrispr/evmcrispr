import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Proxies from "..";

export default defineCommand<Proxies>({
  name: "upgrade-beacon",
  description:
    "Upgrade an UpgradeableBeacon to a new implementation, upgrading every beacon proxy that points to it at once.",
  args: [
    {
      name: "beacon",
      type: "address",
      description: "UpgradeableBeacon address",
    },
    {
      name: "implementation",
      type: "address",
      description: "New implementation address",
    },
  ],
  async run(_module, { beacon, implementation }) {
    return [encodeAction(beacon, "upgradeTo(address)", [implementation])];
  },
});

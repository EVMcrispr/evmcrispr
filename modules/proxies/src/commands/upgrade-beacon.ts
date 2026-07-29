import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
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
    { name: "to", type: "command", description: "Keyword `to`" },
    {
      name: "implementation",
      type: "address",
      description: "New implementation address",
    },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(_module, { beacon, to, implementation }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    return [encodeAction(beacon, "upgradeTo(address)", [implementation])];
  },
});

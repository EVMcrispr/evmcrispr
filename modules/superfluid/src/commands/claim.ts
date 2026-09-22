import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type Superfluid from "..";
import { GDA_FORWARDER } from "../addresses";
import { requireCore } from "../utils/protocol";

export default defineCommand<Superfluid>({
  smartSupport: { kind: "runtime" },
  name: "claim",
  description:
    "Claim all accrued earnings from a GDA pool without connecting to it. Anyone can trigger the claim; the tokens always go to the member.",
  args: [
    { name: "from", type: "command", description: "Keyword `from`" },
    {
      name: "pool",
      runtime: true,
      type: "address",
      description: "GDA pool address",
    },
  ],
  opts: [
    {
      name: "for",
      runtime: true,
      type: "address",
      description: "Member to claim for (defaults to the connected account)",
    },
  ],
  completions: { from: () => [fieldItem("from")] },
  async run(module, { from, pool }, { opts }) {
    if (from !== "from") {
      throw new ErrorException(`expected keyword "from", got "${from}"`);
    }
    await requireCore(module);
    const account = await module.getSender();
    const member = opts.for ?? account;
    return [
      encodeAction(GDA_FORWARDER, "claimAll(address,address,bytes)", [
        pool,
        member,
        "0x",
      ]),
    ];
  },
});

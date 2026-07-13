import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Superfluid from "..";
import { cfaForwarder } from "../addresses";
import { requireCore } from "../utils/protocol";
import { resolveSuperToken } from "../utils/supertoken";

export default defineCommand<Superfluid>({
  name: "stop-stream",
  description:
    "Stop a money stream to a receiver, refunding the sender's buffer deposit. With --from, deletes another sender's stream — allowed for the stream's receiver, a granted flow operator, or anyone once the sender is insolvent.",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "receiver", type: "address", description: "Stream receiver" },
  ],
  opts: [
    {
      name: "from",
      type: "address",
      description:
        "Stream sender when stopping a stream you don't send (as receiver or flow operator)",
    },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(module, { token, to, receiver }, { opts }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const chainId = await requireCore(module);
    const forwarder = cfaForwarder(chainId);
    const superToken = await resolveSuperToken(module, token);

    if (opts.from === undefined) {
      return [
        encodeAction(forwarder, "setFlowrate(address,address,int96)", [
          superToken,
          receiver,
          Num.fromBigInt(0n),
        ]),
      ];
    }

    return [
      encodeAction(forwarder, "deleteFlow(address,address,address,bytes)", [
        superToken,
        opts.from,
        receiver,
        "0x",
      ]),
    ];
  },
});

import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type Superfluid from "..";
import { cfaForwarder } from "../addresses";
import { requireCore } from "../utils/protocol";
import { resolveSuperToken } from "../utils/supertoken";

export default defineCommand<Superfluid>({
  name: "revoke-flow-operator",
  description:
    "Revoke an operator's permissions over your streams of a SuperToken.",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
    { name: "from", type: "command", description: "Keyword `from`" },
    { name: "operator", type: "address", description: "Flow operator" },
  ],
  completions: { from: () => [fieldItem("from")] },
  async run(module, { token, from, operator }) {
    if (from !== "from") {
      throw new ErrorException(`expected keyword "from", got "${from}"`);
    }
    const chainId = await requireCore(module);
    const superToken = await resolveSuperToken(module, token);
    return [
      encodeAction(
        cfaForwarder(chainId),
        "revokePermissions(address,address)",
        [superToken, operator],
      ),
    ];
  },
});

import { defineHelper } from "@evmcrispr/sdk";
import type Superfluid from "..";
import { requireCore } from "../utils/protocol";
import { getUnderlyingToken, resolveSuperToken } from "../utils/supertoken";

export default defineHelper<Superfluid>({
  name: "underlying",
  batchable: false,
  description:
    "Underlying ERC-20 of a SuperToken (the zero address for native-asset SuperTokens like ETHx or xDAIx).",
  returnType: "address",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol or address",
    },
  ],
  async run(module, { token }) {
    await requireCore(module);
    const superToken = await resolveSuperToken(module, token);
    return getUnderlyingToken(module, superToken);
  },
});

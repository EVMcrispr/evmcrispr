import { defineCommand, ErrorException, encodeAction } from "@evmcrispr/sdk";
import type Superfluid from "..";
import { AUTOWRAP_MANAGER } from "../addresses";
import { requireCore, requirePeripheral } from "../utils/protocol";
import {
  getUnderlyingToken,
  isPureSuperToken,
  resolveSuperToken,
} from "../utils/supertoken";

export default defineCommand<Superfluid>({
  name: "stop-auto-wrap",
  description:
    "Cancel an auto-wrap schedule. The strategy's token allowance is not touched — revoke it with token:approve 0 if you want it gone.",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
  ],
  async run(module, { token }) {
    const chainId = await requireCore(module);
    const manager = requirePeripheral(AUTOWRAP_MANAGER, chainId, "Auto-Wrap");
    const superToken = await resolveSuperToken(module, token);
    const underlying = await getUnderlyingToken(module, superToken);
    if (isPureSuperToken(underlying)) {
      throw new ErrorException(
        `${superToken} has no underlying token — auto-wrap only works for wrapper SuperTokens`,
      );
    }
    const account = await module.getConnectedAccount(true);
    return [
      encodeAction(manager, "deleteWrapSchedule(address,address,address)", [
        account,
        superToken,
        underlying,
      ]),
    ];
  },
});

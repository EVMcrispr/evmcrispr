import {
  BindingsSpace,
  coerceBoolean,
  defineCommand,
  ErrorException,
  encodeAction,
} from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import type Superfluid from "..";
import { GDA_AGREEMENT, GDA_FORWARDER } from "../addresses";
import { requireCore } from "../utils/protocol";
import { resolveSuperToken } from "../utils/supertoken";

export default defineCommand<Superfluid>({
  name: "create-pool",
  description:
    "Create a GDA distribution pool for a SuperToken and bind the predicted pool address to <variable>. Members hold units and every distribution splits pro-rata to units. The prediction reads the pool factory's account nonce, so it assumes no other pool is created on the chain between planning and execution.",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the new pool's address to",
    },
    {
      name: "token",
      type: "supertoken",
      description:
        "SuperToken symbol (e.g. USDCx) or address the pool distributes",
    },
  ],
  opts: [
    {
      name: "admin",
      type: "address",
      description:
        "Pool admin, the only account that can update member units (defaults to the connected account)",
    },
    {
      name: "transferable-units",
      type: "bool",
      description: "Let members transfer their units (default false)",
    },
    {
      name: "open-distribution",
      type: "bool",
      description:
        "Let anyone distribute through the pool, not just the admin (default false)",
    },
  ],
  async run(module, { variable, token }, { opts }) {
    const chainId = await requireCore(module);
    const gdaAgreement = GDA_AGREEMENT[chainId];
    if (!gdaAgreement) {
      throw new ErrorException(
        `no GDA agreement known for chain ${chainId} — cannot predict the pool address`,
      );
    }
    const superToken = await resolveSuperToken(module, token);
    const account = await module.getConnectedAccount(true);
    const admin = opts.admin ?? account;
    const transferableUnits =
      opts["transferable-units"] !== undefined &&
      coerceBoolean(opts["transferable-units"]);
    const openDistribution =
      opts["open-distribution"] !== undefined &&
      coerceBoolean(opts["open-distribution"]);

    // SuperfluidPool proxies are deployed with plain CREATE from the GDA
    // agreement contract, so its account nonce predicts the pool address.
    const predicted = await module.reserveNextAddress(gdaAgreement);
    if (predicted === zeroAddress) {
      throw new ErrorException("create-pool: predicted address is zero");
    }

    module.bindingsManager.setBinding(
      variable,
      predicted,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );

    return [
      encodeAction(GDA_FORWARDER, "createPool(address,address,(bool,bool))", [
        superToken,
        admin,
        [transferableUnits, openDistribution],
      ]),
    ];
  },
});

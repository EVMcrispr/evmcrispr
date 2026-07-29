import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Safe from "..";
import { DELAY_MASTERCOPIES } from "../addresses";
import {
  encodeDeployModule,
  encodeSetUp,
  pickDeployedMastercopy,
  predictZodiacModuleAddress,
  toBigInt,
} from "../utils";

export default defineCommand<Safe>({
  name: "install-delay",
  description:
    "Deploy a Zodiac Delay modifier (timelock) owned by the Safe and enable it as a module.",
  args: [
    {
      name: "cooldown",
      type: "number",
      description:
        "Time a queued transaction must wait before execution, in time units (e.g. 1d)",
    },
    {
      name: "expiration",
      type: "number",
      optional: true,
      description:
        "Time after the cooldown during which the transaction can be executed, in time units (0 = never expires)",
    },
  ],
  opts: [
    {
      name: "salt",
      type: "number",
      description: "Deployment salt nonce (defaults to 0)",
    },
  ],
  async run(module, { cooldown, expiration }, { opts }) {
    const safe = await module.resolveSafe();
    const salt = opts.salt !== undefined ? toBigInt(opts.salt) : 0n;
    const mastercopy = await pickDeployedMastercopy(
      await module.getClient(),
      DELAY_MASTERCOPIES,
      "Delay modifier",
    );

    const initializer = encodeSetUp(
      "address owner, address avatar, address target, uint256 cooldown, uint256 expiration",
      [
        safe,
        safe,
        safe,
        toBigInt(cooldown),
        expiration !== undefined ? toBigInt(expiration) : 0n,
      ],
    );

    const delay = predictZodiacModuleAddress(mastercopy, initializer, salt);

    module.context.log(`Installing Delay modifier at ${delay}`);

    return [
      encodeDeployModule(mastercopy, initializer, salt),
      encodeAction(safe, "enableModule(address)", [delay]),
    ];
  },
});

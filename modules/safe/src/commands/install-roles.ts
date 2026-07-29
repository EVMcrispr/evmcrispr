import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Safe from "..";
import { ROLES_MASTERCOPIES } from "../addresses";
import {
  encodeDeployModule,
  encodeSetUp,
  pickDeployedMastercopy,
  predictZodiacModuleAddress,
  toBigInt,
} from "../utils";

export default defineCommand<Safe>({
  name: "install-roles",
  description:
    "Deploy a Zodiac Roles modifier (fine-grained permissions) owned by the Safe and enable it as a module.",
  args: [],
  opts: [
    {
      name: "salt",
      type: "number",
      description: "Deployment salt nonce (defaults to 0)",
    },
  ],
  async run(module, _args, { opts }) {
    const safe = await module.resolveSafe();
    const salt = opts.salt !== undefined ? toBigInt(opts.salt) : 0n;
    const mastercopy = await pickDeployedMastercopy(
      await module.getClient(),
      ROLES_MASTERCOPIES,
      "Roles modifier",
    );

    const initializer = encodeSetUp(
      "address owner, address avatar, address target",
      [safe, safe, safe],
    );

    const roles = predictZodiacModuleAddress(mastercopy, initializer, salt);

    module.context.log(`Installing Roles modifier at ${roles}`);

    return [
      encodeDeployModule(mastercopy, initializer, salt),
      encodeAction(safe, "enableModule(address)", [roles]),
    ];
  },
});

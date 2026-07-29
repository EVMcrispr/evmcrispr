import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Safe from "..";
import { SCOPE_GUARD_MASTERCOPIES } from "../addresses";
import {
  encodeDeployModule,
  encodeSetUp,
  pickDeployedMastercopy,
  predictZodiacModuleAddress,
  toBigInt,
} from "../utils";

export default defineCommand<Safe>({
  name: "install-scope-guard",
  description:
    "Deploy a Zodiac ScopeGuard owned by the Safe and set it as the transaction guard of the Safe, limiting which targets and functions owners can call.",
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
      SCOPE_GUARD_MASTERCOPIES,
      "ScopeGuard",
    );

    const initializer = encodeSetUp("address owner", [safe]);

    const guard = predictZodiacModuleAddress(mastercopy, initializer, salt);

    module.context.log(`Installing ScopeGuard at ${guard}`);

    return [
      encodeDeployModule(mastercopy, initializer, salt),
      encodeAction(safe, "setGuard(address)", [guard]),
    ];
  },
});

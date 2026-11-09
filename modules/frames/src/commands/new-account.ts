import { type Address, BindingsSpace, defineCommand } from "@evmcrispr/sdk";
import { concatHex, encodeAbiParameters } from "viem";
import type Frames from "..";
import { frameAccountBytecode } from "../contracts/artifacts";
import { deployInline } from "../deploy";

export default defineCommand<Frames>({
  smartSupport: {
    kind: "incompatible",
    reason: "The account is deployed now, by a transaction of its own.",
  },
  name: "new-account",
  description:
    "Deploy a frame account owned by an address (default `@me`) and bind its address to <variable>.",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the account address to",
    },
  ],
  opts: [
    {
      name: "owner",
      type: "address",
      description: "Owner whose signature the account accepts (default `@me`)",
    },
  ],
  async run(module, { variable }, { opts, interpreters }) {
    const owner =
      (opts.owner as Address | undefined) ??
      (await module.getConnectedAccount(true));
    const initCode = concatHex([
      frameAccountBytecode,
      encodeAbiParameters([{ type: "address" }], [owner]),
    ]);
    const address = await deployInline(module, interpreters, initCode);
    module.bindingsManager.setBinding(
      variable,
      address,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );
    return [];
  },
});

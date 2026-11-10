import {
  type Address,
  BindingsSpace,
  defineCommand,
  ErrorException,
} from "@evmcrispr/sdk";
import { concatHex, encodeAbiParameters } from "viem";
import type Frames from "..";
import { accountContracts } from "../addresses";
import { deployInline, frameChainId } from "../deploy";
import { gasOption } from "../layout";

export default defineCommand<Frames>({
  smartSupport: {
    kind: "incompatible",
    reason: "The sponsor is deployed now, by a transaction of its own.",
  },
  name: "new-sponsor",
  description:
    "Deploy a frame sponsor that pays for the transactions of an account and bind its address to <variable>.",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the sponsor address to",
    },
  ],
  opts: [
    {
      name: "for",
      type: "address",
      description: "The account whose transactions the sponsor pays for",
    },
    {
      name: "fund",
      type: "number",
      description: "Wei sent with the deployment, to pay with (default 0)",
    },
    {
      name: "owner",
      type: "address",
      description: "Owner who may withdraw (default `@me`)",
    },
  ],
  async run(module, { variable }, { opts, interpreters }) {
    const sponsored = opts.for as Address | undefined;
    if (!sponsored)
      throw new ErrorException(
        "new-sponsor needs --for, the account it pays for",
      );
    const owner =
      (opts.owner as Address | undefined) ??
      (await module.getConnectedAccount(true));
    const value = opts.fund === undefined ? 0n : gasOption(opts.fund, "--fund");
    const initCode = concatHex([
      // The current chain's build: the Hegota devnet's differs.
      accountContracts(await frameChainId(module)).sponsorBytecode,
      encodeAbiParameters(
        [{ type: "address" }, { type: "address" }],
        [owner, sponsored],
      ),
    ]);
    const address = await deployInline(module, interpreters, initCode, value);
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

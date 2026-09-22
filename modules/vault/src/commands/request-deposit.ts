import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import { amountParam } from "@evmcrispr/sdk/onchain";
import type Vault from "..";
import { vaultAsset } from "../erc4626";
import { requireAsyncDeposit } from "../erc7540";
import { parseAmount, rejectNative } from "../utils/amounts";
import { withApproval } from "../utils/plan";

export default defineCommand<Vault>({
  smartSupport: { kind: "runtime" },
  name: "request-deposit",
  primaryCall: -1,
  description:
    "Request a deposit into an ERC-7540 asynchronous vault, approving the vault automatically when needed. The assets are taken immediately; claim the shares with vault:claim-deposit once the request is fulfilled.",
  args: [
    {
      name: "assets",
      runtime: true,
      snapshot: true,
      type: "number",
      description:
        "Amount of the underlying asset to deposit, in base units (wei)",
    },
    { name: "into", type: "command", description: "Keyword `into`" },
    {
      name: "vault",
      type: "address",
      description: "ERC-7540 vault address",
    },
  ],
  opts: [
    {
      name: "controller",
      type: "address",
      runtime: true,
      description:
        "Controller of the request, entitled to claim it (defaults to the connected account)",
    },
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic allowance check and approve action",
    },
  ],
  completions: {
    into: () => [fieldItem("into")],
  },
  async run(module, { assets, into, vault }, { opts }) {
    if (into !== "into") {
      throw new ErrorException(`expected keyword "into", got "${into}"`);
    }
    rejectNative(vault);
    const amount = parseAmount(assets, module);
    await requireAsyncDeposit(module, vault);
    const owner = await module.getSender();
    const controller = opts.controller ?? owner;
    const asset = await vaultAsset(module, vault);
    const action = encodeAction(
      vault,
      "requestDeposit(uint256,address,address) returns (uint256)",
      [amountParam(amount), controller, owner],
    );
    return withApproval(module, [action], asset, owner, vault, amount, opts);
  },
});

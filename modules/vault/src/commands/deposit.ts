import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Vault from "..";
import { vaultAsset } from "../erc4626";
import { isAsyncDepositVault } from "../erc7540";
import { parseAmount, rejectNative } from "../utils/amounts";
import { withApproval } from "../utils/plan";

export default defineCommand<Vault>({
  name: "deposit",
  description:
    "Deposit an exact amount of the underlying asset into an ERC-4626 vault, approving the vault automatically when needed. Works with any 4626-compliant vault such as sDAI, Morpho or Yearn v3. For ERC-7540 asynchronous vaults use vault:request-deposit instead.",
  args: [
    {
      name: "assets",
      type: "number",
      description:
        "Amount of the underlying asset to deposit, in base units (wei)",
    },
    { name: "into", type: "command", description: "Keyword `into`" },
    {
      name: "vault",
      type: "address",
      description: "ERC-4626 vault address",
    },
  ],
  opts: [
    {
      name: "to",
      type: "address",
      description:
        "Receiver of the minted shares (defaults to the connected account)",
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
    if (await isAsyncDepositVault(module, vault)) {
      throw new ErrorException(
        "this vault uses asynchronous deposits (ERC-7540) — use vault:request-deposit / vault:claim-deposit",
      );
    }
    const amount = parseAmount(assets);
    const owner = await module.getConnectedAccount(true);
    const receiver = opts.to ?? owner;
    const asset = await vaultAsset(module, vault);
    const action = encodeAction(vault, "deposit(uint256,address)", [
      Num.fromBigInt(amount),
      receiver,
    ]);
    return withApproval(module, [action], asset, owner, vault, amount, opts);
  },
});

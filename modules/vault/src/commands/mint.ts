import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import { amountParam } from "@evmcrispr/sdk/onchain";
import type Vault from "..";
import { vaultAsset } from "../erc4626";
import { isAsyncDepositVault } from "../erc7540";
import { parseAmount, rejectNative } from "../utils/amounts";
import { withApproval } from "../utils/plan";
import { readVaultUint } from "../utils/smart";

export default defineCommand<Vault>({
  smartSupport: { kind: "runtime" },
  name: "mint",
  primaryCall: -1,
  description:
    "Mint an exact amount of ERC-4626 vault shares, approving the vault for the required assets (previewMint, which rounds up) automatically when needed. For ERC-7540 asynchronous vaults use vault:request-deposit instead.",
  args: [
    {
      name: "shares",
      runtime: true,
      snapshot: true,
      type: "number",
      description: "Amount of vault shares to mint, in base units (wei)",
    },
    { name: "of", type: "command", description: "Keyword `of`" },
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
      runtime: true,
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
    of: () => [fieldItem("of")],
  },
  async run(module, { shares, of, vault }, { opts }) {
    if (of !== "of") {
      throw new ErrorException(`expected keyword "of", got "${of}"`);
    }
    rejectNative(vault);
    if (await isAsyncDepositVault(module, vault)) {
      throw new ErrorException(
        "this vault uses asynchronous deposits (ERC-7540) — use vault:request-deposit / vault:claim-deposit",
      );
    }
    const amount = parseAmount(shares, module);
    const owner = await module.getSender();
    const receiver = opts.to ?? owner;
    const asset = await vaultAsset(module, vault);
    const required = await readVaultUint(module, vault, "previewMint", [
      amount,
    ]);
    const action = encodeAction(
      vault,
      "mint(uint256,address) returns (uint256)",
      [amountParam(amount), receiver],
    );
    return withApproval(module, [action], asset, owner, vault, required, opts);
  },
});

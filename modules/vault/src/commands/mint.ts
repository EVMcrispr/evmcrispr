import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Vault from "..";
import { readVaultUint, vaultAsset } from "../erc4626";
import { parseAmount, rejectNative } from "../utils/amounts";
import { withApproval } from "../utils/plan";

export default defineCommand<Vault>({
  name: "mint",
  description:
    "Mint an exact amount of ERC-4626 vault shares, approving the vault for the required assets (previewMint, which rounds up) automatically when needed.",
  args: [
    {
      name: "shares",
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
    const amount = parseAmount(shares);
    const owner = await module.getConnectedAccount(true);
    const receiver = opts.to ?? owner;
    const asset = await vaultAsset(module, vault);
    const required = await readVaultUint(module, vault, "previewMint", [
      amount,
    ]);
    const action = encodeAction(vault, "mint(uint256,address)", [
      Num.fromBigInt(amount),
      receiver,
    ]);
    return withApproval(module, [action], asset, owner, vault, required, opts);
  },
});

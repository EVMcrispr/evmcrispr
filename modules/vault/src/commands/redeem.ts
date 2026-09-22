import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import { amountParam, isRuntimeValue } from "@evmcrispr/sdk/onchain";
import type Vault from "..";
import { isAsyncRedeemVault } from "../erc7540";
import { parseAmountOrMax, rejectNative } from "../utils/amounts";
import { vaultShareBalance } from "../utils/smart";

export default defineCommand<Vault>({
  smartSupport: { kind: "runtime" },
  name: "redeem",
  description:
    "Redeem an exact amount of ERC-4626 vault shares for the underlying asset. Pass `max` as the amount to redeem the full share balance. For ERC-7540 asynchronous vaults use vault:request-redeem instead.",
  args: [
    {
      name: "shares",
      runtime: true,
      snapshot: true,
      type: ["command", "number"],
      description:
        "Amount of vault shares to redeem in base units (wei), or the keyword `max` for the full balance",
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
        "Receiver of the redeemed assets (defaults to the connected account)",
    },
  ],
  completions: {
    shares: () => [fieldItem("max")],
    of: () => [fieldItem("of")],
  },
  async run(module, { shares, of, vault }, { opts }) {
    if (of !== "of") {
      throw new ErrorException(`expected keyword "of", got "${of}"`);
    }
    rejectNative(vault);
    if (await isAsyncRedeemVault(module, vault)) {
      throw new ErrorException(
        "this vault uses asynchronous redemptions (ERC-7540) — use vault:request-redeem / vault:claim-redeem",
      );
    }
    const parsed = parseAmountOrMax(shares, module);
    const owner = await module.getSender();
    const receiver = opts.to ?? owner;
    const amount =
      parsed === "max" ? await vaultShareBalance(module, vault, owner) : parsed;
    if (!isRuntimeValue(amount) && amount <= 0n) {
      throw new ErrorException("nothing to redeem");
    }
    return [
      encodeAction(vault, "redeem(uint256,address,address) returns (uint256)", [
        amountParam(amount),
        receiver,
        owner,
      ]),
    ];
  },
});

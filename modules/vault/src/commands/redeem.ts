import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Vault from "..";
import { readVaultUint } from "../erc4626";
import { parseAmountOrMax, rejectNative } from "../utils/amounts";

export default defineCommand<Vault>({
  name: "redeem",
  description:
    "Redeem an exact amount of ERC-4626 vault shares for the underlying asset. Pass `max` as the amount to redeem the full share balance.",
  args: [
    {
      name: "shares",
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
    const parsed = parseAmountOrMax(shares);
    const owner = await module.getConnectedAccount(true);
    const receiver = opts.to ?? owner;
    const amount =
      parsed === "max"
        ? await readVaultUint(module, vault, "balanceOf", [owner])
        : parsed;
    if (amount <= 0n) {
      throw new ErrorException("nothing to redeem");
    }
    return [
      encodeAction(vault, "redeem(uint256,address,address)", [
        Num.fromBigInt(amount),
        receiver,
        owner,
      ]),
    ];
  },
});

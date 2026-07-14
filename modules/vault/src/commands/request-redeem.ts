import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Vault from "..";
import { requireAsyncRedeem, vaultShareBalance } from "../erc7540";
import { parseAmountOrMax, rejectNative } from "../utils/amounts";

export default defineCommand<Vault>({
  name: "request-redeem",
  description:
    "Request a redemption of shares from an ERC-7540 asynchronous vault. Pass `max` as the amount to request the full share balance. The shares are taken immediately; claim the assets with vault:claim-redeem once the request is fulfilled.",
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
      description: "ERC-7540 vault address",
    },
  ],
  opts: [
    {
      name: "controller",
      type: "address",
      description:
        "Controller of the request, entitled to claim it (defaults to the connected account)",
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
    await requireAsyncRedeem(module, vault);
    const owner = await module.getConnectedAccount(true);
    const controller = opts.controller ?? owner;
    const amount =
      parsed === "max" ? await vaultShareBalance(module, vault, owner) : parsed;
    if (amount <= 0n) {
      throw new ErrorException("nothing to redeem");
    }
    return [
      encodeAction(vault, "requestRedeem(uint256,address,address)", [
        Num.fromBigInt(amount),
        controller,
        owner,
      ]),
    ];
  },
});

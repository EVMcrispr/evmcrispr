import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import { amountParam, isRuntimeValue } from "@evmcrispr/sdk/onchain";
import type Vault from "..";
import { requireAsyncRedeem } from "../erc7540";
import { parseAmountOrMax, rejectNative } from "../utils/amounts";
import { vaultShareBalance } from "../utils/smart";

export default defineCommand<Vault>({
  smartSupport: { kind: "runtime" },
  name: "request-redeem",
  description:
    "Request a redemption of shares from an ERC-7540 asynchronous vault. Pass `max` as the amount to request the full share balance. The shares are taken immediately; claim the assets with vault:claim-redeem once the request is fulfilled.",
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
    const parsed = parseAmountOrMax(shares, module);
    await requireAsyncRedeem(module, vault);
    const owner = await module.getSender();
    const controller = opts.controller ?? owner;
    const amount =
      parsed === "max" ? await vaultShareBalance(module, vault, owner) : parsed;
    if (!isRuntimeValue(amount) && amount <= 0n) {
      throw new ErrorException("nothing to redeem");
    }
    return [
      encodeAction(
        vault,
        "requestRedeem(uint256,address,address) returns (uint256)",
        [amountParam(amount), controller, owner],
      ),
    ];
  },
});

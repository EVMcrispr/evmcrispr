import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Vault from "..";
import { readVault7540Uint, requireAsyncRedeem } from "../erc7540";
import { parseAmountOrMax, rejectNative } from "../utils/amounts";
import { parseExact, parseRequestId } from "../utils/requests";

export default defineCommand<Vault>({
  name: "claim-redeem",
  description:
    "Claim the assets of a fulfilled ERC-7540 redemption request. Pass `max` as the amount to claim everything claimable. By default the amount is exact shares; pass --exact assets to claim an exact amount of assets instead.",
  args: [
    {
      name: "amount",
      type: ["command", "number"],
      description:
        "Amount to claim in base units (wei) — shares by default, assets with --exact assets — or the keyword `max` for everything claimable",
    },
    { name: "from", type: "command", description: "Keyword `from`" },
    {
      name: "vault",
      type: "address",
      description: "ERC-7540 vault address",
    },
  ],
  opts: [
    {
      name: "to",
      type: "address",
      description:
        "Receiver of the claimed assets (defaults to the connected account)",
    },
    {
      name: "controller",
      type: "address",
      description:
        "Controller of the request being claimed (defaults to the connected account; requires operator rights when it is not the sender)",
    },
    {
      name: "request-id",
      type: "number",
      description:
        "Request id, for vaults that key requests by id (defaults to 0, the controller-keyed convention)",
    },
    {
      name: "exact",
      type: "string",
      description:
        "Which amount is exact: `shares` (default, uses redeem) or `assets` (uses withdraw)",
    },
  ],
  completions: {
    amount: () => [fieldItem("max")],
    from: () => [fieldItem("from")],
  },
  async run(module, { amount, from, vault }, { opts }) {
    if (from !== "from") {
      throw new ErrorException(`expected keyword "from", got "${from}"`);
    }
    rejectNative(vault);
    const exact = parseExact(opts, "shares");
    const requestId = parseRequestId(opts);
    const parsed = parseAmountOrMax(amount);
    await requireAsyncRedeem(module, vault);
    const owner = await module.getConnectedAccount(true);
    const controller = opts.controller ?? owner;
    const receiver = opts.to ?? owner;
    const claimable =
      parsed === "max"
        ? exact === "shares"
          ? await readVault7540Uint(module, vault, "claimableRedeemRequest", [
              requestId,
              controller,
            ])
          : await readVault7540Uint(module, vault, "maxWithdraw", [controller])
        : parsed;
    if (claimable <= 0n) {
      throw new ErrorException("nothing to claim");
    }
    const signature =
      exact === "shares"
        ? "redeem(uint256,address,address)"
        : "withdraw(uint256,address,address)";
    return [
      encodeAction(vault, signature, [
        Num.fromBigInt(claimable),
        receiver,
        controller,
      ]),
    ];
  },
});

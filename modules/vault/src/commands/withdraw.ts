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
  name: "withdraw",
  description:
    "Withdraw an exact amount of the underlying asset from an ERC-4626 vault, burning the required shares. Pass `max` as the amount to withdraw everything available.",
  args: [
    {
      name: "assets",
      type: ["command", "number"],
      description:
        "Amount of the underlying asset to withdraw in base units (wei), or the keyword `max` for everything available",
    },
    { name: "from", type: "command", description: "Keyword `from`" },
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
        "Receiver of the withdrawn assets (defaults to the connected account)",
    },
  ],
  completions: {
    assets: () => [fieldItem("max")],
    from: () => [fieldItem("from")],
  },
  async run(module, { assets, from, vault }, { opts }) {
    if (from !== "from") {
      throw new ErrorException(`expected keyword "from", got "${from}"`);
    }
    rejectNative(vault);
    const parsed = parseAmountOrMax(assets);
    const owner = await module.getConnectedAccount(true);
    const receiver = opts.to ?? owner;
    const amount =
      parsed === "max"
        ? await readVaultUint(module, vault, "maxWithdraw", [owner])
        : parsed;
    if (amount <= 0n) {
      throw new ErrorException("nothing to withdraw");
    }
    return [
      encodeAction(vault, "withdraw(uint256,address,address)", [
        Num.fromBigInt(amount),
        receiver,
        owner,
      ]),
    ];
  },
});

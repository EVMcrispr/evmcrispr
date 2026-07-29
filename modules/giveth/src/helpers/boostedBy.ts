import { defineHelper, Num } from "@evmcrispr/sdk";
import type Giveth from "..";
import { fetchPowerBoostings, fetchUserId } from "../utils/graphql";

export default defineHelper<Giveth>({
  name: "boostedBy",
  batchable: false,
  description:
    "Projects an account boosts with its GIVpower, as a pair of same-length arrays [slugs percentages] sorted by percentage descending. Empty arrays when the account has no boosts.",
  returnType: "array",
  args: [
    {
      name: "account",
      type: "address",
      optional: true,
      description: "Account to inspect (defaults to the connected account)",
    },
  ],
  async run(module, { account }) {
    const owner = account ?? (await module.getConnectedAccount(true));
    const userId = await fetchUserId(module, owner);
    if (userId === undefined) return [[], []];
    const boostings = (await fetchPowerBoostings(module, userId))
      .filter((b) => b.percentage > 0)
      .sort((a, b) => b.percentage - a.percentage);
    return [
      boostings.map((b) => b.project.slug),
      boostings.map((b) => Num.fromDecimalString(String(b.percentage))),
    ];
  },
});

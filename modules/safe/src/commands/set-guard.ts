import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Safe from "..";

export default defineCommand<Safe>({
  name: "set-guard",
  description:
    "Set a transaction guard on the Safe: a contract that checks every transaction before and after execution (e.g. a Zodiac ScopeGuard).",
  args: [
    { name: "guard", type: "address", description: "Guard contract address" },
  ],
  async run(module, { guard }) {
    const safe = await module.resolveSafe();

    return [encodeAction(safe, "setGuard(address)", [guard])];
  },
});

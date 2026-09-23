import { defineHelper, isNamedArgNode } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData } from "viem";
import type Safe from "..";
import { GUARD_STORAGE_SLOT, MODULE_GUARD_STORAGE_SLOT } from "../addresses";
import { getGuard, safeAbi } from "../utils";

export default defineHelper<Safe>({
  name: "guard",
  description:
    "Transaction guard address of a Safe, or with module:true its module guard (the zero address when none is set; module guards need Safe v1.5.0 or later, so it is always zero on older Safes).",
  returnType: "address",
  batchable: false,
  args: [
    {
      name: "safe",
      type: "address",
      optional: true,
      description:
        "Safe address (defaults to the context Safe or connected account)",
    },
    {
      name: "module",
      type: "bool",
      namedOnly: true,
      description: "`module:true` — read the module guard instead",
    },
  ],
  async run(module, { safe, module: moduleGuard }) {
    return getGuard(
      await module.getClient(),
      await module.resolveSafe(safe),
      moduleGuard ? MODULE_GUARD_STORAGE_SLOT : GUARD_STORAGE_SLOT,
    );
  },
  compile: async (ctx, node) => {
    const [safeArg] = node.args.filter((arg) => !isNamedArgNode(arg));
    const moduleArg = node.args.find(
      (arg) => isNamedArgNode(arg) && arg.name === "module",
    );
    const explicit = safeArg
      ? String(await ctx.interpreters.interpretNode(safeArg))
      : undefined;
    const safe = await (ctx.module as Safe).resolveSafe(explicit as never);
    // Which slot to read is fixed when the script is built, like the Safe.
    const moduleGuard =
      moduleArg && isNamedArgNode(moduleArg)
        ? String(await ctx.interpreters.interpretNode(moduleArg.value)) ===
          "true"
        : false;
    const slot = moduleGuard ? MODULE_GUARD_STORAGE_SLOT : GUARD_STORAGE_SLOT;
    // getStorageAt(slot, 1) returns bytes [0x20][32][slot word]: the
    // guard address word is word 2 of the envelope.
    return directReadOperand(
      ctx,
      safe,
      encodeFunctionData({
        abi: safeAbi,
        functionName: "getStorageAt",
        args: [BigInt(slot), 1n],
      }),
      "Address",
      2n,
    );
  },
});

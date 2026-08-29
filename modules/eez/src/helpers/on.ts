import {
  chainLabel,
  defineHelper,
  ErrorException,
  type Node,
  resolveChainId,
} from "@evmcrispr/sdk";
import type Eez from "..";

export default defineHelper<Eez>({
  name: "on",
  batchable: false,
  description:
    "Evaluate an expression as if the script were on another chain, and return its value. Reads only: helpers, `::` calls, variables and arithmetic all resolve against that chain, then the script continues on its own chain.",
  returnType: "any",
  args: [
    {
      name: "chain",
      type: "chain",
      description: "Chain to evaluate on (`eezL2`, a viem name or a chain id)",
    },
    {
      name: "expression",
      type: "any",
      lazy: true,
      description:
        "Expression evaluated as if the script had switched to that chain",
    },
  ],
  async run(module, { chain, expression }, { interpreters }) {
    const node = expression as Node | undefined;
    if (!node) {
      throw new ErrorException(
        "@eez:on expects a chain and an expression, e.g. @eez:on(6290 @balance(ETH @me))",
      );
    }
    const target = resolveChainId(chain);
    const current = await module.getChainId();
    if (target === current) return interpreters.interpretNode(node);

    const previous = await module.getClient();
    try {
      module.switchChainId(target);
    } catch {
      throw new ErrorException(
        `${chainLabel(target)} is not configured — no RPC is known for it in this environment`,
      );
    }
    try {
      return await interpreters.interpretNode(node);
    } finally {
      // Restore the exact previous client (not a rebuilt one): inside a
      // simulation that keeps the fork the script was running against.
      module.context.setClient(previous);
    }
  },
});

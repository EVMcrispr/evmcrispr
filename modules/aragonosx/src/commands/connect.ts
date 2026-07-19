import type { Action, BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type AragonOSx from "..";
import { loadDao } from "../dao";

export default defineCommand<AragonOSx>({
  name: "connect",
  description:
    "Connect to an Aragon OSx DAO and execute commands within its context.",
  createsBatchContext: true,
  args: [
    {
      name: "dao",
      type: "dao",
      description:
        "DAO address or ENS subdomain (e.g. `mydao` for mydao.dao.eth)",
    },
    {
      name: "block",
      type: "block",
      description: "Commands to execute in DAO context",
    },
  ],
  async run(module, { dao: daoAddressOrName, block }, { interpreters }) {
    const { interpretNode } = interpreters;

    if (module.currentDAO) {
      throw new ErrorException(
        'nested "connect" commands are not supported; use sequential top-level connect blocks and `set $var` to share values',
      );
    }

    const dao = await loadDao(module, daoAddressOrName);

    let actions: Action[];
    try {
      actions = (await interpretNode(block as BlockExpressionNode, {
        blockInitializer: async () => {
          module.setCurrentDAO(dao);
        },
        // Inherit hasActions from any enclosing batch context: reads
        // inside this block can't see the outer batch's actions either.
        batchContext: {
          name: "connect",
          hasActions: interpreters.batchContext?.hasActions ?? false,
        },
      })) as Action[];
    } finally {
      module.clearCurrentDAO();
    }

    return actions;
  },
});

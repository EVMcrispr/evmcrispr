import type { Action, BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { isAddressEqual } from "viem";
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

    const currentDAO = module.currentDAO;
    const dao = await loadDao(
      module,
      daoAddressOrName,
      currentDAO ? currentDAO.nestingIndex + 1 : 1,
    );

    if (currentDAO && isAddressEqual(currentDAO.address, dao.address)) {
      throw new ErrorException(
        `trying to connect to an already connected DAO (${dao.address})`,
      );
    }

    let actions: Action[];
    try {
      actions = (await interpretNode(block as BlockExpressionNode, {
        blockInitializer: async () => {
          module.pushDAO(dao);
        },
        // Inherit hasActions from any enclosing batch context: reads
        // inside this block can't see the outer batch's actions either.
        batchContext: {
          name: "connect",
          hasActions: interpreters.batchContext?.hasActions ?? false,
        },
      })) as Action[];
    } finally {
      module.popDAO();
    }

    return actions;
  },
});

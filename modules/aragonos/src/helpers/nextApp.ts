import {
  computeNextContractAddress,
  defineHelper,
  ErrorException,
} from "@evmcrispr/sdk";
import type AragonOS from "..";

export default defineHelper<AragonOS>({
  name: "nextApp",
  args: [{ name: "offset", type: "number", optional: true }],
  async run(module, { offset = 0 }) {
    const dao = module.currentDAO;
    if (!dao) {
      throw new ErrorException(
        '@nextApp must be used within a "connect" command',
      );
    }

    const kernel = dao.kernel;
    const internalIndex = (await module.getNonce(kernel.address)) ?? 0;
    const client = await module.getClient();

    return computeNextContractAddress(
      kernel.address,
      internalIndex + offset,
      (addr) => client.getTransactionCount({ address: addr }),
    );
  },
});

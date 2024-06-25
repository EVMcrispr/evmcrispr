import type { ICommand } from "../../../types";

import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  encodeAction,
  getOptValue,
} from "../../../utils";
import { defaultRelayerMap } from "../addresses";

import type { Giveth } from "../Giveth";

export const finalizeGivbacks: ICommand<Giveth> = {
  async run(module, c, { interpretNode, interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 1 });
    checkOpts(c, ["relayer"]);

    const [hash] = await interpretNodes(c.args);

    const defaultRelayerAddr = defaultRelayerMap.get(await module.getChainId());

    if (!defaultRelayerAddr) {
      throw new Error(
        `No default relayer for chain ${await module.getChainId()}`,
      );
    }

    const relayerAddr =
      (await getOptValue(c, "relayer", interpretNode)) || defaultRelayerAddr;

    const batches = await fetch(
      "https://ipfs.blossom.software/ipfs/" + hash,
    ).then((data) => data.json());
    return batches.map((batch: any) =>
      encodeAction(relayerAddr, "executeBatch(uint256,address[],uint256[])", [
        batch.nonce,
        batch.recipients,
        batch.amounts,
      ]),
    );
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};

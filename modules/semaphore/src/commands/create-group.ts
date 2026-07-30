import {
  BindingsSpace,
  defineCommand,
  encodeAction,
  Num,
} from "@evmcrispr/sdk";
import type Semaphore from "..";
import { readSemaphore, requireSemaphore } from "../utils/semaphore";

export default defineCommand<Semaphore>({
  name: "create-group",
  description:
    "Create a Semaphore group on the canonical contract and bind the predicted group id to <variable>. Without --admin the transaction sender becomes the admin (correct through Safes and forwarders).",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the new group id to",
    },
  ],
  opts: [
    {
      name: "admin",
      type: "address",
      description: "Group admin (default: the transaction sender)",
    },
  ],
  async run(module, { variable }, { opts }) {
    const { address, chainId } = await requireSemaphore(module);
    const groupId = await readSemaphore(module, "groupCounter");
    // A group that doesn't exist yet has no event history: prime the member
    // cache so later scans only cover blocks after creation (this also keeps
    // scans tiny on forks whose upstream RPC caps getLogs ranges).
    const client = await module.getClient();
    module.setMemberCache(`${chainId}:${groupId}`, {
      members: [],
      lastBlock: await client.getBlockNumber(),
    });
    module.bindingsManager.setBinding(
      variable,
      Num.fromBigInt(groupId),
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );
    return [
      opts.admin !== undefined
        ? encodeAction(address, "createGroup(address)", [opts.admin])
        : encodeAction(address, "createGroup()", []),
    ];
  },
});

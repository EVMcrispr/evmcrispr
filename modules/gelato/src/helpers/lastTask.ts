import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type Gelato from "..";
import { taskIdsOf } from "./tasks";

export default defineHelper<Gelato>({
  name: "lastTask",
  batchable: false,
  description:
    "Id of the most recently created active Gelato Automate task of an account — handy right after gelato:automate.",
  returnType: "bytes32",
  args: [
    {
      name: "creator",
      type: "address",
      description: "Task creator (defaults to the connected account)",
      optional: true,
    },
  ],
  async run(module, { creator }) {
    const account =
      (creator as Address | undefined) ?? (await module.getConnectedAccount());
    const ids = await taskIdsOf(module, account);
    if (ids.length === 0) {
      throw new ErrorException(`${account} has no active Gelato tasks`);
    }
    return ids[ids.length - 1];
  },
});

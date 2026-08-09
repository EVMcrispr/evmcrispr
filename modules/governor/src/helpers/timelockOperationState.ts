import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  coreCall,
  encodeCond,
  rawParam,
  staticCallParam,
  toWord,
} from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, getAddress, isHex } from "viem";
import type Governor from "..";
import { timelockAbi } from "../utils";

export default defineHelper<Governor>({
  name: "timelockOperationState",
  batchable: false,
  description:
    "State of a TimelockController operation: Unset, Waiting, Ready or Done. As @timelockOperationState! a nested core cond over the timelock's isOperationDone/isOperationReady/isOperationPending views producing OZ's NUMERIC OperationState (0 Unset, 1 Waiting, 2 Ready, 3 Done) — the string mapping stays off-chain.",
  returnType: "string",
  args: [
    {
      name: "timelock",
      type: "address",
      description: "TimelockController address",
    },
    {
      name: "operationId",
      type: "bytes32",
      description: "Operation id (bound by governor:timelock-schedule)",
    },
  ],
  async run(module, { timelock, operationId }) {
    const client = await module.getClient();
    // getTimestamp encodes the state: 0 = unset, 1 = done, else the ETA
    const timestamp = await client.readContract({
      address: timelock,
      abi: timelockAbi,
      functionName: "getTimestamp",
      args: [operationId],
    });
    if (timestamp === 0n) return "Unset";
    if (timestamp === 1n) return "Done";
    const block = await client.getBlock();
    return timestamp <= block.timestamp ? "Ready" : "Waiting";
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@timelockOperationState! expects (timelock operationId)",
      );
    }
    const timelock = getAddress(
      String(await ctx.interpreters.interpretNode(node.args[0])),
    );
    const rawId = String(await ctx.interpreters.interpretNode(node.args[1]));
    if (!isHex(rawId) || rawId.length !== 66) {
      throw new ErrorException(
        `@timelockOperationState! operationId must be a bytes32 value, got ${rawId}`,
      );
    }
    const view = (
      functionName:
        | "isOperationDone"
        | "isOperationReady"
        | "isOperationPending",
    ) =>
      staticCallParam(
        timelock,
        encodeFunctionData({ abi: timelockAbi, functionName, args: [rawId] }),
      );
    // Nested lazy conds over the three state views, producing OZ's
    // numeric OperationState: cond(done, 3, cond(ready, 2,
    // cond(pending, 1, 0))) — Done = 3, Ready = 2, Waiting = 1
    // (pending but not ready), Unset = 0. The string names stay
    // off-chain; the numeric table lives in the helper's doc page.
    const inner = staticCallParam(
      ctx.core,
      encodeCond(
        view("isOperationPending"),
        rawParam(toWord(1n)),
        rawParam(toWord(0n)),
      ),
    );
    const middle = staticCallParam(
      ctx.core,
      encodeCond(view("isOperationReady"), rawParam(toWord(2n)), inner),
    );
    return coreCall(
      ctx,
      encodeCond(view("isOperationDone"), rawParam(toWord(3n)), middle),
      "Uint",
    );
  },
});

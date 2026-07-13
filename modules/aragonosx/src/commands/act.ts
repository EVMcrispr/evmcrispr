import type { Action, BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { isHex, stringToHex } from "viem";
import type AragonOSx from "..";
import { DAO_ABI } from "../abis";
import { abiAction } from "../utils/encode";
import { toOsxActions } from "../utils/osxActions";

const ZERO_CALL_ID = `0x${"0".repeat(64)}` as Hex;

export default defineCommand<AragonOSx>({
  name: "act",
  description:
    "Execute actions directly through the DAO (the caller needs EXECUTE_PERMISSION on it).",
  createsBatchContext: true,
  args: [{ name: "block", type: "block", description: "Actions to execute" }],
  opts: [
    {
      name: "call-id",
      type: "string",
      description: "bytes32 identifier attached to the execution (default 0x0)",
    },
    {
      name: "allow-failure-map",
      type: "number",
      description: "Bitmap of actions allowed to fail (default none)",
    },
  ],
  async run(module, { block }, { opts, interpreters }) {
    const { interpretNode } = interpreters;
    const dao = module.requireCurrentDAO("act");

    const blockActions = (await interpretNode(block as BlockExpressionNode, {
      // Inherit hasActions from any enclosing batch context: reads inside
      // this block can't see the outer batch's actions either.
      batchContext: {
        name: "act",
        hasActions: interpreters.batchContext?.hasActions ?? false,
      },
    })) as Action[];

    const osxActions = toOsxActions(blockActions, "act");

    let callId = ZERO_CALL_ID;
    if (opts["call-id"]) {
      const raw = String(opts["call-id"]);
      if (isHex(raw)) {
        if (raw.length > 66) {
          throw new ErrorException(`--call-id must fit in bytes32, got ${raw}`);
        }
        callId = `0x${raw.slice(2).padStart(64, "0")}` as Hex;
      } else {
        if (raw.length > 32) {
          throw new ErrorException(
            `--call-id must fit in bytes32, got "${raw}"`,
          );
        }
        callId = stringToHex(raw, { size: 32 });
      }
    }

    return [
      abiAction(dao.address, DAO_ABI, "execute", [
        callId,
        osxActions,
        opts["allow-failure-map"] ? BigInt(opts["allow-failure-map"]) : 0n,
      ]),
    ];
  },
});

import type { Address, TransactionAction } from "@evmcrispr/sdk";
import { defineCommand, ErrorException, encodeAction } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import type Frame from "..";
import { markFrame } from "../marks";

const APPROVE = ["execution", "payment", "both"] as const;

export default defineCommand<Frame>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "A frame transaction is its own transaction; it cannot run inside a smart batch.",
  },
  name: "verify",
  description:
    "Write one VERIFY frame of a frame transaction: a static call to the target that approves the transaction. Only works inside `frame:tx`.",
  args: [
    {
      name: "target",
      runtime: true,
      type: "address",
      description:
        "Account that runs the verification (`@me` for the sender's own)",
    },
    {
      name: "signature",
      type: "write-abi",
      optional: true,
      description: 'Function signature (e.g. `"verify()"`); none sends no data',
    },
    {
      name: "params",
      runtime: true,
      type: "any",
      description: "Arguments matching the signature types",
      rest: true,
    },
  ],
  opts: [
    {
      name: "approve",
      type: "string",
      description:
        "What the frame approves: `execution`, `payment` or `both` (required)",
    },
    { name: "gas", type: "number", description: "Gas limit of the frame" },
  ],
  async run(module, { target, signature, params }, { opts }) {
    if (module.depth === 0)
      throw new ErrorException("verify only works inside frame:tx");
    const approve = opts.approve as (typeof APPROVE)[number] | undefined;
    if (!approve || !APPROVE.includes(approve))
      throw new ErrorException(
        `verify needs --approve execution, payment or both${approve ? `, not ${approve}` : ""}: it names what the frame approves.`,
      );

    const encoded = signature
      ? encodeAction(target, signature, params ?? [])
      : { to: target as Address, data: "0x" as Hex };
    if (typeof encoded.to !== "string")
      throw new ErrorException(
        "verify needs its target and arguments when the script is written: a frame is laid out before anything runs, so drop the runtime value.",
      );
    const frame: TransactionAction = {
      to: encoded.to,
      data: encoded.data ?? "0x",
      value: 0n,
    };
    if (opts.gas !== undefined) frame.gas = BigInt(opts.gas);
    markFrame(frame, { mode: "verify", approve });
    return [frame];
  },
});

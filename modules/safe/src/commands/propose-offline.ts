import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import {
  acceptSafeInput,
  assertSafeVersion,
  buildSafeTx,
  classifySafeInput,
  getSafeNonce,
  interpretSafeBlock,
} from "../utils";
import { safeUint, stringifySafeTransaction } from "../utils/offline";
import { isCancelKeyword, rejectionSignable } from "../utils/queue";
import { logSafeSignable } from "../utils/sign";
import {
  bindSafeOutput,
  contentMessageSignable,
  type SafeSignable,
  transactionSignable,
} from "../utils/signables";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "propose-offline",
  description:
    "Create an unsigned Safe transaction, rejection or Safe message without the Safe Transaction Service and bind its JSON to a variable, for owners to sign with safe:confirm-offline.",
  batchable: false,
  createsBatchContext: true,
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable that receives the unsigned JSON",
    },
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "proposal",
      supportsSmartBlock: true,
      type: ["block", "string"],
      description:
        "Commands composing the transaction, `cancel` (with --nonce) to reject a pending one, or a message (text or EIP-712 typed data)",
    },
  ],
  opts: [
    {
      name: "salt",
      type: "bytes32",
      description:
        "Smart-batch storage salt for reproducible offline signing (block forms with !)",
    },
    {
      name: "nonce",
      type: "number",
      description:
        "Safe nonce for a command block (defaults to the on-chain nonce), or of the pending transaction to cancel",
    },
  ],
  async run(
    module,
    { variable, safe, proposal },
    { opts, interpreters, node },
  ) {
    const chainId = await module.getChainId();
    if (isCancelKeyword(node.args[2])) {
      const rejection = await rejectionSignable(module, safe, opts.nonce);
      logSafeSignable(module, rejection);
      const output = stringifySafeTransaction(rejection);
      bindSafeOutput(module, variable, output);
      module.context.log(output);
      return [];
    }
    const input = classifySafeInput(proposal, { chainId, safe });
    if (input.kind === "nested")
      throw new ErrorException(
        `this JSON belongs to Safe ${input.parent.safe}: to approve it as its owner Safe, run safe:confirm-offline $tx ${input.parent.safe} $tx; the owner Safe is found automatically`,
      );
    acceptSafeInput(input, ["block", "content"], "safe:propose-offline");
    if (
      opts.salt !== undefined &&
      !(input.kind === "block" && input.block.smart)
    )
      throw new ErrorException("--salt requires a smart block (!(...))");
    if (input.kind !== "block" && opts.nonce !== undefined)
      throw new ErrorException(
        "--nonce only applies to a command block; messages have no nonce",
      );
    let signable: SafeSignable;
    if (input.kind === "block") {
      const actions = await interpretSafeBlock(
        module,
        safe,
        input.block,
        "safe:propose-offline",
        interpreters,
        { salt: opts.salt },
      );
      if (actions.length === 0) return [];
      const client = await module.getClient();
      await assertSafeVersion(client, safe);
      signable = transactionSignable(
        chainId,
        safe,
        buildSafeTx(
          actions,
          opts.nonce !== undefined
            ? safeUint(opts.nonce, "nonce")
            : await getSafeNonce(client, safe),
          safeDeployment(chainId),
        ),
      );
    } else {
      await assertSafeVersion(await module.getClient(), safe);
      signable = contentMessageSignable(chainId, safe, input.content);
    }
    logSafeSignable(module, signable);
    const output = stringifySafeTransaction(signable);
    bindSafeOutput(module, variable, output);
    module.context.log(output);
    return [];
  },
});

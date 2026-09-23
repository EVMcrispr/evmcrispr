import { defineCommand } from "@evmcrispr/sdk";
import type Safe from "..";
import {
  acceptSafeInput,
  assertSafeVersion,
  classifySafeInput,
  fetchQueuedSignable,
} from "../utils";
import { ALLOW_OPTS } from "../utils/assess";
import { gateSignable } from "../utils/gate";
import { walletSignSafeSignable } from "../utils/nested";
import { stringifySafeTransaction } from "../utils/offline";
import { bindSafeOutput, kindLabel } from "../utils/signables";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "confirm-offline",
  description:
    "Sign a Safe transaction or Safe message as an owner, or through an owner Safe, and bind the signed JSON to a variable without posting it to the Safe Transaction Service.",
  batchable: false,
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable that receives the signed JSON",
    },
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "signable",
      type: ["bytes32", "string"],
      description:
        "Safe transaction or Safe message JSON, or the hash of one queued on the service (exported with its confirmations)",
    },
  ],
  opts: [
    {
      name: "message",
      type: "bool",
      description: "The hash is a safeMessageHash, not a safeTxHash",
    },
    {
      name: "via",
      type: "address",
      description:
        "Owner Safe to sign through, when you own several owner Safes",
    },
    ...ALLOW_OPTS,
  ],
  async run(module, { variable, safe, signable: arg }, { opts, interpreters }) {
    const chainId = await module.getChainId();
    const input = classifySafeInput(arg, {
      chainId,
      safe,
      message: opts.message,
    });
    acceptSafeInput(
      input,
      ["signable", "txHash", "messageHash"],
      "safe:confirm-offline",
    );
    await assertSafeVersion(await module.getClient(), safe);
    const signable =
      input.kind === "signable"
        ? input.signable
        : (await fetchQueuedSignable(module, chainId, safe, input)).signable;
    // Competing transactions are only known to the service.
    await gateSignable(module, signable, opts, "safe:confirm-offline", {
      competing: input.kind === "txHash",
    });
    const signed = await walletSignSafeSignable(
      module,
      interpreters,
      signable,
      "safe:confirm-offline",
      { via: opts.via },
    );
    const output = stringifySafeTransaction(signed);
    bindSafeOutput(module, variable, output);
    module.context.log(
      `Signed ${kindLabel(signed)} (${signed.signatures.length} signature${signed.signatures.length === 1 ? "" : "s"}):`,
    );
    module.context.log(output);
    return [];
  },
});

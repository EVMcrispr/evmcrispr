import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import {
  acceptSafeInput,
  assertSafeVersion,
  buildSafeTx,
  classifySafeInput,
  encodeExecTransaction,
  fetchQueuedSignable,
  getSafeNonce,
  interpretSafeBlock,
  smartPlanFor,
} from "../utils";
import { ALLOW_OPTS } from "../utils/assess";
import { executorCompletes, gateSignable } from "../utils/gate";
import { executableRejection, isCancelKeyword } from "../utils/queue";
import {
  expectKind,
  type SafeSignable,
  transactionSignable,
} from "../utils/signables";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "execute",
  description:
    "Execute a Safe transaction on-chain from a command block, cancel (a rejection of the pending transaction), the safeTxHash of a confirmed queued transaction, or signed Safe transaction JSON.",
  batchable: false,
  createsBatchContext: true,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "proposal",
      supportsSmartBlock: true,
      type: ["block", "bytes32", "string"],
      description:
        "Commands, `cancel` to reject the pending transaction, the safeTxHash of a queued transaction, or Safe transaction JSON",
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
        "Nonce of the pending transaction to cancel (defaults to the on-chain nonce, the only one that can execute)",
    },
    {
      name: "gas",
      type: "number",
      description:
        "Gas limit of the execTransaction call, for calls the RPC cannot estimate (e.g. cross-chain ones)",
    },
    ...ALLOW_OPTS,
  ],
  async run(module, { safe, proposal }, { opts, interpreters, node }) {
    const chainId = await module.getChainId();
    const cancel = isCancelKeyword(node.args[1]);
    if (!cancel && opts.nonce !== undefined)
      throw new ErrorException(
        "--nonce only applies to cancel: a command block runs at the on-chain nonce, and a queued transaction or Safe transaction JSON fixes its own",
      );
    const input = cancel
      ? undefined
      : classifySafeInput(proposal, { chainId, safe });
    if (input?.kind === "signable" && input.signable.kind === "message")
      throw new ErrorException(
        "a Safe message is not executed; read its signature with @safe:signature",
      );
    if (input)
      acceptSafeInput(input, ["block", "txHash", "signable"], "safe:execute");
    if (
      opts.salt !== undefined &&
      !(input?.kind === "block" && input.block.smart)
    )
      throw new ErrorException("--salt requires a smart block (!(...))");
    const client = await module.getClient();

    // Hash form: a queued transaction, rebuilt from the service data and
    // refused unless it hashes back to the requested safeTxHash, with its
    // owner confirmations (EIP-712 and owner Safe signatures). From here on
    // it is authorized exactly like Safe transaction JSON.
    let queued: SafeSignable | undefined;
    if (input?.kind === "txHash") {
      await assertSafeVersion(client, safe);
      const { signable, serviceTx } = await fetchQueuedSignable(
        module,
        chainId,
        safe,
        input,
      );
      if (serviceTx?.isExecuted)
        throw new ErrorException(
          `Safe transaction ${input.hash} has already been executed`,
        );
      expectKind(signable, "transaction");
      queued = signable;
    }

    // Authorization comes from the signatures, on-chain approveHash
    // approvals, and the executor itself when it is an owner. A command block
    // is built at the current on-chain nonce; only a safeTxHash, or a
    // rejection the executor cannot authorize alone, contacts the Safe
    // Transaction Service.
    await assertSafeVersion(client, safe);
    const imported =
      queued ?? (input?.kind === "signable" ? input.signable : undefined);
    if (imported) expectKind(imported, "transaction");
    const actions =
      input?.kind === "block"
        ? await interpretSafeBlock(
            module,
            safe,
            input.block,
            "safe:execute",
            interpreters,
            { salt: opts.salt },
          )
        : undefined;
    if (actions?.length === 0) return [];
    const executor = await module.getConnectedAccount(true);
    const signable = cancel
      ? await executableRejection(module, safe, opts.nonce, executor)
      : (imported ??
        transactionSignable(
          chainId,
          safe,
          buildSafeTx(
            actions!,
            await getSafeNonce(client, safe),
            safeDeployment(chainId),
          ),
        ));
    expectKind(signable, "transaction");
    // The executor's own approval makes executing the act that authorizes
    // the transaction: it is reviewed then, and refused on blocking
    // findings, whoever wrote it.
    const report = await gateSignable(module, signable, opts, "safe:execute", {
      competing: cancel || input?.kind === "txHash",
      executor,
      enforce: executorCompletes,
    });
    if (!report.ready)
      throw new ErrorException(
        `Safe transaction is not ready: ${report.readiness} (current on-chain nonce ${report.chain.nonce}; ${report.signatures.filter((s) => s.status === "valid").length} of ${report.chain.threshold} required owner signatures)${report.readiness === "insufficient-signatures" ? "; collect signatures with safe:confirm or safe:confirm-offline, or on-chain confirmations with safe:confirm-onchain" : ""}`,
      );
    return [
      {
        ...encodeExecTransaction(
          safe,
          signable.tx,
          report.packedSignatures,
          signable.safeTxHash,
        ),
        ...(report.executorSigned ? { from: executor } : {}),
        ...(opts.gas !== undefined ? { gas: BigInt(opts.gas) } : {}),
        executionPlan: smartPlanFor(actions),
      },
    ];
  },
});

import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import {
  acceptSafeInput,
  assertSafeVersion,
  buildSafeTx,
  classifySafeInput,
  collectSafeTxWarnings,
  encodeExecTransaction,
  fetchQueuedSignable,
  formatSafeTxHashesLog,
  getSafeNonce,
  getSafeTxHashes,
  interpretSafeBlock,
  smartPlanFor,
  warnCompetingTransactions,
} from "../utils";
import {
  expectKind,
  reviewSafeSignable,
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
    "Execute a Safe transaction on-chain from a command block, the safeTxHash of a confirmed queued transaction, or signed Safe transaction JSON.",
  batchable: false,
  createsBatchContext: true,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "proposal",
      supportsSmartBlock: true,
      type: ["block", "bytes32", "string"],
      description:
        "Commands, the safeTxHash of a queued transaction, or Safe transaction JSON",
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
      name: "gas",
      type: "number",
      description:
        "Gas limit of the execTransaction call, for calls the RPC cannot estimate (e.g. cross-chain ones)",
    },
  ],
  async run(module, { safe, proposal }, { opts, interpreters }) {
    const chainId = await module.getChainId();
    const input = classifySafeInput(proposal, { chainId, safe });
    if (input.kind === "signable" && input.signable.kind === "message")
      throw new ErrorException(
        "a Safe message is not executed; read its signature with @safe:signature",
      );
    acceptSafeInput(input, ["block", "txHash", "signable"], "safe:execute");
    if (
      opts.salt !== undefined &&
      !(input.kind === "block" && input.block.smart)
    )
      throw new ErrorException("--salt requires a smart block (!(...))");
    const client = await module.getClient();

    // Hash form: a queued transaction, rebuilt from the service data and
    // refused unless it hashes back to the requested safeTxHash, with its
    // owner confirmations (EIP-712 and owner Safe signatures). From here on
    // it is authorized exactly like Safe transaction JSON.
    let queued: SafeSignable | undefined;
    if (input.kind === "txHash") {
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
      await warnCompetingTransactions(
        module,
        chainId,
        safe,
        signable.tx.nonce,
        signable.safeTxHash,
      );
      queued = signable;
    }

    // Authorization comes from the signatures, on-chain approveHash
    // approvals, and the executor itself when it is an owner. A command block
    // is built at the current on-chain nonce; only a safeTxHash contacts the
    // Safe Transaction Service.
    await assertSafeVersion(client, safe);
    const imported =
      queued ?? (input.kind === "signable" ? input.signable : undefined);
    if (imported) expectKind(imported, "transaction");
    const actions =
      input.kind === "block"
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
    const tx =
      imported?.tx ??
      buildSafeTx(
        actions!,
        await getSafeNonce(client, safe),
        safeDeployment(chainId),
      );
    const executor = await module.getConnectedAccount(true);
    const signable = imported ?? transactionSignable(chainId, safe, tx);
    const report = await reviewSafeSignable(signable, client, {}, executor);
    if (!report.ready)
      throw new ErrorException(
        `Safe transaction is not ready: ${report.readiness} (current on-chain nonce ${report.chain.nonce}; ${report.signatures.filter((s) => s.status === "valid").length} of ${report.chain.threshold} required owner signatures)${report.readiness === "insufficient-signatures" ? "; collect signatures with safe:confirm or safe:confirm-offline, or on-chain confirmations with safe:confirm-onchain" : ""}`,
      );
    const hashes = getSafeTxHashes(chainId, safe, tx);
    module.context.log(
      formatSafeTxHashesLog(
        safe,
        chainId,
        tx,
        hashes,
        collectSafeTxWarnings(tx, safeDeployment(chainId)),
      ),
    );
    return [
      {
        ...encodeExecTransaction(
          safe,
          tx,
          report.packedSignatures,
          hashes.safeTxHash,
        ),
        ...(report.executorSigned ? { from: executor } : {}),
        ...(opts.gas !== undefined ? { gas: BigInt(opts.gas) } : {}),
        executionPlan: smartPlanFor(actions),
      },
    ];
  },
});

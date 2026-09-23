import type { Address, BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { isAddressEqual } from "viem";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import {
  assertSafeVersion,
  buildSafeTx,
  collectSafeTxWarnings,
  encodeExecTransaction,
  formatSafeTxHashesLog,
  getOwners,
  getSafeNonce,
  getSafeTxHashes,
  getServiceTransaction,
  getThreshold,
  interpretSafeBlock,
  preValidatedSignature,
  serviceTxToSafeTx,
  smartPlanFor,
} from "../utils";
import { safeUint } from "../utils/offline";
import {
  mergeSafePackages,
  parseSafePackage,
  reviewSafePackage,
  transactionPackage,
} from "../utils/packages";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "execute",
  description:
    "Execute a Safe transaction on-chain from a command block, a confirmed service transaction hash, or locally signed transaction JSON with --no-api.",
  batchable: false,
  createsBatchContext: true,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "proposal",
      supportsSmartBlock: true,
      type: ["block", "bytes32", "string"],
      description:
        "Commands, the safeTxHash of a queued transaction, or exported transaction JSON with --no-api",
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
      name: "no-api",
      type: "bool",
      description:
        "Execute a block or exported transaction JSON without contacting the Safe Transaction Service",
    },
    {
      name: "signatures",
      type: "array",
      description:
        "EIP-712 owner signatures to add locally (requires --no-api; blocks also require --nonce)",
    },
    {
      name: "nonce",
      type: "number",
      description: "Nonce signed for a command block (requires --no-api)",
    },
  ],
  async run(module, { safe, proposal }, { opts, interpreters }) {
    if (
      opts.salt !== undefined &&
      !(typeof proposal === "object" && proposal?.smart)
    )
      throw new ErrorException("--salt requires a smart block (!(...))");
    const noApi = opts["no-api"];
    if (!noApi && (opts.signatures !== undefined || opts.nonce !== undefined)) {
      throw new ErrorException("--signatures and --nonce require --no-api");
    }
    if (noApi && typeof proposal === "string" && opts.nonce !== undefined) {
      throw new ErrorException(
        "--nonce cannot override an imported transaction",
      );
    }
    if (
      noApi &&
      typeof proposal !== "string" &&
      opts.signatures !== undefined &&
      opts.nonce === undefined
    ) {
      throw new ErrorException(
        "--signatures with a command block requires --nonce so signatures use the intended nonce",
      );
    }
    const chainId = await module.getChainId();
    const client = await module.getClient();

    if (
      noApi &&
      (typeof proposal === "string" || opts.signatures !== undefined)
    ) {
      await assertSafeVersion(client, safe);
      const imported =
        typeof proposal === "string"
          ? parseSafePackage(proposal, chainId, safe)
          : undefined;
      const actions = imported
        ? undefined
        : await interpretSafeBlock(
            module,
            safe,
            proposal as BlockExpressionNode,
            "safe:execute",
            interpreters,
            { salt: opts.salt },
          );
      if (actions?.length === 0) return [];
      if (imported && imported.kind !== "transaction")
        throw new ErrorException("expected transaction package");
      const tx =
        imported?.tx ??
        buildSafeTx(
          actions!,
          safeUint(opts.nonce, "nonce"),
          safeDeployment(chainId),
        );
      const pkg = await mergeSafePackages(
        imported ?? transactionPackage(chainId, safe, tx),
        opts.signatures ?? [],
      );
      const report = await reviewSafePackage(pkg, client);
      if (!report.ready)
        throw new ErrorException(
          `Safe transaction is not ready: ${report.readiness} (current on-chain nonce ${report.chain.nonce}; ${report.signatures.filter((s) => s.status === "valid").length} of ${report.chain.threshold} required owner signatures)`,
        );
      const hashes = getSafeTxHashes(chainId, safe, tx);
      const signatures = report.packedSignatures;
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
          ...encodeExecTransaction(safe, tx, signatures, hashes.safeTxHash),
          executionPlan: smartPlanFor(actions),
        },
      ];
    }

    // Hash form: execute a queued transaction confirmed on the service.
    if (typeof proposal === "string") {
      if (!/^0x[0-9a-fA-F]{64}$/.test(proposal)) {
        throw new ErrorException("exported transaction JSON requires --no-api");
      }
      await assertSafeVersion(client, safe);
      const serviceTx = await getServiceTransaction(module, chainId, proposal);

      if (!isAddressEqual(serviceTx.safe, safe)) {
        throw new ErrorException(
          `Safe transaction ${proposal} belongs to Safe ${serviceTx.safe}, not ${safe}`,
        );
      }

      // Never trust the service's fields: they must hash back to the
      // requested safeTxHash, or the signatures would cover different data.
      const tx = serviceTxToSafeTx(serviceTx);
      const hashes = getSafeTxHashes(chainId, safe, tx);
      if (hashes.safeTxHash.toLowerCase() !== proposal.toLowerCase()) {
        throw new ErrorException(
          `the transaction data returned by the Safe Transaction Service hashes to ${hashes.safeTxHash}, not ${proposal}; refusing to execute possibly tampered data (note: only Safe >=1.3.0 is supported)`,
        );
      }

      if (serviceTx.isExecuted) {
        throw new ErrorException(
          `Safe transaction ${proposal} has already been executed`,
        );
      }

      const confirmations = serviceTx.confirmations ?? [];
      if (confirmations.length < serviceTx.confirmationsRequired) {
        throw new ErrorException(
          `Safe transaction ${proposal} has ${confirmations.length} of ${serviceTx.confirmationsRequired} required confirmations`,
        );
      }

      // execTransaction expects the 65-byte signatures concatenated in
      // ascending signer address order.
      const signatures = confirmations
        .slice()
        .sort((a, b) =>
          a.owner.toLowerCase() < b.owner.toLowerCase() ? -1 : 1,
        )
        .reduce<`0x${string}`>(
          (acc, c) => `${acc}${c.signature.slice(2)}` as `0x${string}`,
          "0x",
        );

      module.context.log(
        formatSafeTxHashesLog(
          safe,
          chainId,
          tx,
          hashes,
          collectSafeTxWarnings(tx, safeDeployment(chainId)),
        ),
      );

      return [encodeExecTransaction(safe, tx, signatures, hashes.safeTxHash)];
    }

    // Block form: build and execute directly with the sender's
    // pre-validated signature.
    const actions = await interpretSafeBlock(
      module,
      safe,
      proposal as BlockExpressionNode,
      "safe:execute",
      interpreters,
      { salt: opts.salt },
    );

    if (actions.length === 0) {
      return [];
    }

    const sender = await module.getConnectedAccount(true);
    const [owners, threshold] = await Promise.all([
      getOwners(client, safe),
      getThreshold(client, safe),
    ]);

    if (!owners.some((o) => isAddressEqual(o, sender as Address))) {
      throw new ErrorException(
        `connected account ${sender} is not an owner of Safe ${safe}`,
      );
    }
    if (threshold !== 1n) {
      throw new ErrorException(
        `Safe ${safe} has a threshold of ${threshold}; use safe:propose to collect the remaining signatures`,
      );
    }

    const nonce = await getSafeNonce(client, safe);
    if (opts.nonce !== undefined && safeUint(opts.nonce, "nonce") !== nonce) {
      throw new ErrorException(
        `Safe transaction nonce does not match the current on-chain nonce ${nonce}`,
      );
    }
    const tx = buildSafeTx(actions, nonce, safeDeployment(chainId));

    return [
      {
        ...encodeExecTransaction(
          safe,
          tx,
          preValidatedSignature(sender),
          getSafeTxHashes(chainId, safe, tx).safeTxHash,
        ),
        from: sender,
        executionPlan: smartPlanFor(actions),
      },
    ];
  },
});

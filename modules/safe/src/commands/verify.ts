import type { Address, BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand, ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import {
  encodeFunctionData,
  isAddressEqual,
  parseAbi,
  zeroAddress,
} from "viem";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import type { SafeTx, ServiceTransaction } from "../utils";
import {
  assertSafeVersion,
  buildSafeTx,
  collectSafeTxWarnings,
  formatSafeTxHashesLog,
  getSafeNonce,
  getSafeTxHashes,
  getServiceTransaction,
  getServiceTransactionsByNonce,
  interpretSafeBlock,
  serviceTxToSafeTx,
  toBigInt,
} from "../utils";
import { safeUint } from "../utils/offline";
import {
  bindSafeOutput,
  parseSafePackage,
  reviewSafePackage,
  type SafePackage,
  transactionPackage,
} from "../utils/packages";

const approveHashAbi = parseAbi([
  "function approveHash(bytes32 hashToApprove)",
]);

export default defineCommand<Safe>({
  name: "verify",
  description:
    "Verify Safe transaction hashes and flag dangerous fields, using the service queue or a command block or exported transaction JSON with --no-api.",
  batchable: false,
  createsBatchContext: true,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "proposal",
      type: ["number", "bytes32", "block", "string"],
      description:
        "Nonce or hash of a queued transaction, or a command block or exported transaction JSON with --no-api",
    },
  ],
  opts: [
    {
      name: "as",
      type: "variable",
      description: "Bind the JSON verification report (requires --no-api)",
    },
    {
      name: "offline",
      type: "bool",
      description: "Inspect an exported package without any network access",
    },
    {
      name: "abi",
      type: "string",
      description:
        "JSON mapping target addresses to explicit ABIs for local decoding",
    },
    {
      name: "no-api",
      type: "bool",
      description:
        "Verify a command block or exported transaction JSON without contacting the Safe Transaction Service",
    },
    {
      name: "nonce",
      type: "number",
      description:
        "Nonce override for a command block (requires --no-api; defaults to the on-chain nonce)",
    },
    {
      name: "nested-safe",
      type: "address",
      description:
        "Owner Safe that will approve the transaction via approveHash; also prints the hashes its owners must sign",
    },
    {
      name: "nested-safe-nonce",
      type: "number",
      description: "Nonce override for the nested Safe approveHash transaction",
    },
  ],
  async run(module, { safe, proposal }, { opts, interpreters }) {
    if (!opts["no-api"] && (opts.as || opts.abi))
      throw new ErrorException("--as and --abi require --no-api");
    if (!opts["no-api"] && opts.nonce !== undefined) {
      throw new ErrorException("--nonce requires --no-api");
    }
    if (
      opts.offline &&
      (!opts["no-api"] || typeof proposal !== "string" || opts["nested-safe"])
    )
      throw new ErrorException(
        "--offline requires --no-api and a package; nested approval previews require RPC",
      );
    const chainId = await module.getChainId();
    const client = await module.getClient();
    if (!opts.offline) await assertSafeVersion(client, safe);

    const nestedSafe = opts["nested-safe"] as Address | undefined;
    if (opts["nested-safe-nonce"] !== undefined && !nestedSafe) {
      throw new ErrorException(
        "--nested-safe-nonce requires --nested-safe to be set",
      );
    }

    let serviceTxs: ServiceTransaction[] = [];
    const transactions: SafeTx[] = [];
    let imported: SafePackage | undefined;
    const reports: unknown[] = [];
    if (opts["no-api"]) {
      if (typeof proposal === "string") {
        if (opts.nonce !== undefined)
          throw new ErrorException(
            "--nonce cannot override an imported transaction",
          );
        imported = parseSafePackage(proposal, chainId, safe);
        if (imported.kind !== "transaction")
          throw new ErrorException(
            "use safe:verify-message for message packages",
          );
        transactions.push(imported.tx);
      } else if (
        proposal &&
        typeof proposal === "object" &&
        "type" in proposal
      ) {
        const actions = await interpretSafeBlock(
          module,
          safe,
          proposal as BlockExpressionNode,
          "safe:verify",
          interpreters,
        );
        if (actions.length === 0) return [];
        transactions.push(
          buildSafeTx(
            actions,
            opts.nonce !== undefined
              ? safeUint(opts.nonce, "nonce")
              : await getSafeNonce(client, safe),
            safeDeployment(chainId),
          ),
        );
      } else {
        throw new ErrorException(
          "--no-api requires a command block or exported Safe transaction JSON; a nonce alone cannot recover transaction data without the service",
        );
      }
    } else if (typeof proposal === "string") {
      if (!/^0x[0-9a-fA-F]{64}$/.test(proposal))
        throw new ErrorException("exported transaction JSON requires --no-api");
      serviceTxs = [await getServiceTransaction(module, chainId, proposal)];
    } else {
      if (proposal && typeof proposal === "object" && "type" in proposal)
        throw new ErrorException("verifying a command block requires --no-api");
      const nonce = toBigInt(proposal);
      serviceTxs = await getServiceTransactionsByNonce(
        module,
        chainId,
        safe,
        nonce,
      );
      if (serviceTxs.length === 0) {
        throw new ErrorNotFound(
          `no queued transaction found for Safe ${safe} at nonce ${nonce}`,
        );
      }
      if (serviceTxs.length > 1) {
        module.context.log(
          `⚠️ WARNING: ${serviceTxs.length} transactions are queued at nonce ${nonce} — only one can execute; make sure the safeTxHash you sign matches the intended one`,
        );
      }
    }

    for (const serviceTx of serviceTxs) {
      if (!isAddressEqual(serviceTx.safe, safe)) {
        throw new ErrorException(
          `Safe transaction ${serviceTx.safeTxHash} belongs to Safe ${serviceTx.safe}, not ${safe}`,
        );
      }

      const tx = serviceTxToSafeTx(serviceTx);
      const hashes = getSafeTxHashes(chainId, safe, tx);
      if (
        hashes.safeTxHash.toLowerCase() !== serviceTx.safeTxHash.toLowerCase()
      ) {
        throw new ErrorException(
          `safeTxHash mismatch: locally computed ${hashes.safeTxHash} but the Safe Transaction Service reports ${serviceTx.safeTxHash} — the service data may be tampered with; do NOT sign or execute this transaction`,
        );
      }

      transactions.push(tx);
    }

    for (const tx of transactions) {
      if (opts["no-api"]) {
        const report = await reviewSafePackage(
          imported ?? transactionPackage(chainId, safe, tx),
          opts.offline ? undefined : client,
          opts.abi ? JSON.parse(opts.abi) : {},
        );
        reports.push(report);
        module.context.log(
          `Authorization: ${report.readiness}${opts.offline ? " (offline: current owners, approvals and contract signatures unchecked)" : ""}`,
        );
        for (const check of report.signatures)
          module.context.log(
            `  ${check.owner} (${check.type}): ${check.status}`,
          );
      }
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

      if (nestedSafe) {
        await assertSafeVersion(client, nestedSafe);
        const nestedTx: SafeTx = {
          to: safe,
          value: 0n,
          data: encodeFunctionData({
            abi: approveHashAbi,
            functionName: "approveHash",
            args: [hashes.safeTxHash],
          }),
          operation: 0,
          safeTxGas: 0n,
          baseGas: 0n,
          gasPrice: 0n,
          gasToken: zeroAddress,
          refundReceiver: zeroAddress,
          nonce:
            opts["nested-safe-nonce"] !== undefined
              ? safeUint(opts["nested-safe-nonce"], "nested-safe-nonce")
              : await getSafeNonce(client, nestedSafe),
        };
        module.context.log(
          `Nested Safe approveHash transaction (to be signed by the owners of ${nestedSafe}):\n${formatSafeTxHashesLog(
            nestedSafe,
            chainId,
            nestedTx,
            getSafeTxHashes(chainId, nestedSafe, nestedTx),
            [],
          )}`,
        );
      }
    }

    bindSafeOutput(
      module,
      opts.as,
      reports.length === 1 ? reports[0] : reports,
    );
    return [];
  },
});

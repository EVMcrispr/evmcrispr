import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Safe from "..";
import { assertSafeVersion } from "../utils";
import {
  assessCompeting,
  blockedBy,
  type DecodedCall,
  requiredOptions,
} from "../utils/assess";
import { stringifySafeTransaction } from "../utils/offline";
import { resolveSignable } from "../utils/resolve";
import { reviewSafeSignable } from "../utils/signables";

/** A decoded call for the report: calldata only where it was not decoded,
 *  arguments by name. */
const reportCall = ({
  to,
  value,
  data,
  operation,
  decoded,
}: DecodedCall): unknown => {
  const { args, inputs, calls, ...rest } = decoded as DecodedCall["decoded"] & {
    args?: unknown[];
    inputs?: { name?: string }[];
  };
  return {
    to,
    value,
    operation,
    ...(decoded.status === "unverified" ? { data } : {}),
    decoded: {
      ...rest,
      ...(args
        ? {
            args: Object.fromEntries(
              args.map((a, i) => [inputs?.[i]?.name || String(i), a]),
            ),
          }
        : {}),
      ...(calls ? { calls: calls.map(reportCall) } : {}),
    },
  };
};

export default defineHelper<Safe>({
  name: "verify",
  description:
    "Verification report of a Safe transaction or Safe message as JSON: integrity-checked hashes, decoded calls, findings, owner signature checks, on-chain approvals, readiness and competing transactions, with the verdict safe:confirm and safe:execute would reach.",
  returnType: "string",
  batchable: false,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "target",
      type: ["number", "bytes32", "string"],
      description:
        "Nonce or safeTxHash of a queued transaction, a safeMessageHash with message:true, or Safe transaction or Safe message JSON",
    },
    {
      name: "message",
      type: "bool",
      namedOnly: true,
      description: "`message:true` — the hash is a safeMessageHash",
    },
    {
      name: "abi",
      type: "string",
      namedOnly: true,
      description:
        "`abi:<json>` — JSON mapping target addresses to explicit ABIs for local decoding",
    },
    {
      name: "no-rpc",
      type: "bool",
      namedOnly: true,
      description:
        "`no-rpc:true` — no network access at all (JSON only); owners, approvals, threshold and nonce stay unchecked",
    },
  ],
  async run(module, { safe, target, message, abi, "no-rpc": noRpc }) {
    let abis = {};
    if (abi !== undefined) {
      try {
        abis = JSON.parse(abi);
      } catch {
        throw new ErrorException(
          "abi: expected a JSON object mapping addresses to ABI arrays",
        );
      }
    }
    if (noRpc && (typeof target !== "string" || !target.trim().startsWith("{")))
      throw new ErrorException(
        "no-rpc:true needs Safe transaction or Safe message JSON; a nonce or hash is looked up on the Safe Transaction Service",
      );
    const { signable, fromService, skipped, competing } = await resolveSignable(
      module,
      safe,
      target,
      { message, helperName: "@safe:verify" },
    );
    const client = noRpc ? undefined : await module.getClient();
    if (client) await assertSafeVersion(client, safe);
    const report = await reviewSafeSignable(signable, client, abis);
    // The same findings gate safe:confirm and safe:execute. Rivals at the
    // same nonce are only known for items fetched from the service.
    const findings = [
      ...report.findings,
      ...(fromService && signable.kind === "transaction"
        ? assessCompeting(signable.safe, signable.tx, competing)
        : []),
    ];
    const blocking = blockedBy(findings);
    // Each fact once: the typed data is the item (and what owners sign),
    // so the item, its signing bytes and the raw calldata are not repeated.
    const { finalHash: _, ...hashes } = report.hashes;
    return stringifySafeTransaction({
      kind: signable.kind,
      ...(signable.kind === "message" && signable.content !== undefined
        ? { content: signable.content }
        : {}),
      typedData: report.typedData,
      hashes,
      decodedCalls: report.decodedCalls.map(reportCall),
      signatures: report.signatures,
      packedSignatures: report.packedSignatures,
      chain: report.chain,
      readiness: report.readiness,
      findings,
      verdict: blocking.length ? "blocked" : "pass",
      requires: requiredOptions(blocking),
      competing,
      skippedConfirmations: skipped,
    });
  },
});

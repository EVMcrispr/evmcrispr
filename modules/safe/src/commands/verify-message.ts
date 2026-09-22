import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Safe from "..";
import { getSafeMessageHashes } from "../utils";
import {
  bindSafeOutput,
  messagePackage,
  parseSafePackage,
  reviewSafePackage,
} from "../utils/packages";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "verify-message",
  description:
    "Compute the EIP-712 hashes of an off-chain Safe message (plain string or typed-data JSON) so signers can verify what their wallet displays.",
  batchable: false,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "message",
      type: "string",
      description: "Raw message string, or an EIP-712 typed-data JSON document",
    },
  ],
  opts: [
    {
      name: "as",
      type: "variable",
      description: "Bind the JSON verification report",
    },
    {
      name: "format",
      type: "string",
      description:
        "auto (text or typed data) or bytes (exact hex bytes for nested signatures)",
    },
    {
      name: "offline",
      type: "bool",
      description:
        "Compute the report without RPC; chain-dependent checks remain unchecked",
    },
  ],
  async run(module, { safe, message }, { opts }) {
    const chainId = await module.getChainId();
    let parsed: any;
    try {
      parsed = JSON.parse(message);
    } catch {
      /* plain text or bytes */
    }
    const pkg =
      parsed?.kind === "message"
        ? parseSafePackage(parsed, chainId, safe)
        : messagePackage(chainId, safe, message, opts.format ?? "auto");
    if (pkg.kind !== "message")
      throw new ErrorException("expected message package");
    const report = await reviewSafePackage(
      pkg,
      opts.offline ? undefined : await module.getClient(),
    );
    bindSafeOutput(module, opts.as, report);
    module.context.log(
      `Authorization: ${report.readiness}${opts.offline ? " (offline: current authorization unchecked)" : ""}`,
    );
    if (opts.format === "bytes" || parsed?.kind === "message") {
      module.context.log(
        `Safe message (safe ${safe}, chain ${chainId})\n  Domain hash: ${report.hashes.domainHash}\n  Message hash: ${report.hashes.messageHash}\n  SafeMessage hash: ${report.hashes.finalHash}`,
      );
      return [];
    }

    const result = getSafeMessageHashes(chainId, safe, String(message));
    module.context.log(
      [
        `Safe message (safe ${safe}, chain ${chainId}, ${
          result.kind === "eip712" ? "EIP-712 typed data" : "EIP-191 message"
        })`,
        `  Raw message hash:  ${result.innerHash}`,
        `  Domain hash:       ${result.domainHash}`,
        `  Message hash:      ${result.messageHash}`,
        `  SafeMessage hash:  ${result.safeMessageHash}`,
      ].join("\n"),
    );

    return [];
  },
});

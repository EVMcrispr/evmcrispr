import type { Address } from "@evmcrispr/sdk";
import type Safe from "..";
import {
  type AllowOpts,
  assessCompeting,
  enforceFindings,
  type SafeFinding,
} from "./assess";
import { logSafeSignable } from "./sign";
import { reviewSafeSignable, type SafeSignable } from "./signables";
import { competingTransactions } from "./txService";

export type SafeReview = Awaited<ReturnType<typeof reviewSafeSignable>>;

/**
 * Review a Safe transaction or Safe message someone else authored before
 * signing, approving or executing it: print its hashes and findings, and
 * refuse while a blocking finding is not lifted by its --allow-* flag.
 * `competing` asks the Safe Transaction Service for rival transactions at
 * the same nonce.
 */
export async function gateSignable(
  module: Safe,
  signable: SafeSignable,
  allow: AllowOpts,
  commandName: string,
  { competing = false, executor }: { competing?: boolean; executor?: Address },
): Promise<SafeReview & { findings: SafeFinding[] }> {
  const report = await reviewSafeSignable(
    signable,
    await module.getClient(),
    {},
    executor,
  );
  const findings = [...report.findings];
  if (competing && signable.kind === "transaction")
    findings.push(
      ...assessCompeting(
        signable.safe,
        signable.tx,
        await competingTransactions(
          module,
          signable.chainId,
          signable.safe,
          signable.tx.nonce,
          signable.safeTxHash,
        ),
      ),
    );
  logSafeSignable(module, signable, { findings, allow, enforced: true });
  enforceFindings(findings, allow, commandName);
  return { ...report, findings };
}

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
 * Review a Safe transaction or Safe message before signing, approving or
 * executing it: print its hashes and findings, and refuse while a blocking
 * finding is not lifted by its --allow-* flag. `enforce` decides from the
 * review whether this command is the one that must answer for it (by
 * default always); otherwise only notices are printed. `competing` asks the
 * Safe Transaction Service for rival transactions at the same nonce.
 */
export async function gateSignable(
  module: Safe,
  signable: SafeSignable,
  allow: AllowOpts,
  commandName: string,
  {
    competing = false,
    executor,
    enforce = true,
  }: {
    competing?: boolean;
    executor?: Address;
    enforce?: boolean | ((report: SafeReview) => boolean | Promise<boolean>);
  },
): Promise<SafeReview & { findings: SafeFinding[]; enforced: boolean }> {
  const report = await reviewSafeSignable(
    signable,
    await module.getClient(),
    {},
    executor,
  );
  const enforced =
    typeof enforce === "function" ? await enforce(report) : enforce;
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
  logSafeSignable(module, signable);
  if (enforced) enforceFindings(findings, allow, commandName);
  return { ...report, findings, enforced };
}

/** Whether the executor's own approval is one of the signatures an execution
 *  relies on: then executing is what authorizes it. */
export const executorCompletes = (report: SafeReview): boolean =>
  report.executorSigned;

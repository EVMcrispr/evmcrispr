import type { Address } from "@evmcrispr/sdk";
import type Safe from "..";
import { acceptSafeInput, classifySafeInput } from "./index";
import type { SafeSignable } from "./signables";
import {
  fetchQueuedSignable,
  getServiceTransactionsByNonce,
} from "./txService";

/** The Safe transaction or Safe message a helper argument names: JSON is used
 *  as is (no service access), a nonce or hash is fetched from the service and
 *  integrity-checked. */
export async function resolveSignable(
  module: Safe,
  safe: Address,
  value: unknown,
  { message, helperName }: { message?: boolean; helperName: string },
): Promise<{
  signable: SafeSignable;
  fromService: boolean;
  skipped: number;
  competing: string[];
}> {
  const chainId = await module.getChainId();
  const input = classifySafeInput(value, { chainId, safe, message });
  acceptSafeInput(
    input,
    ["signable", "nonce", "txHash", "messageHash"],
    helperName,
  );
  if (input.kind === "signable")
    return {
      signable: input.signable,
      fromService: false,
      skipped: 0,
      competing: [],
    };
  const { signable, skipped } = await fetchQueuedSignable(
    module,
    chainId,
    safe,
    input,
  );
  const competing =
    signable.kind === "transaction"
      ? (
          await getServiceTransactionsByNonce(
            module,
            chainId,
            safe,
            signable.tx.nonce,
          )
        )
          .filter(
            (t) =>
              !t.isExecuted &&
              t.safeTxHash.toLowerCase() !== signable.safeTxHash.toLowerCase(),
          )
          .map((t) => t.safeTxHash)
      : [];
  return { signable, fromService: true, skipped, competing };
}

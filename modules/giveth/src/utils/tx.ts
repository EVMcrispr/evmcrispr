import type { Action, TransactionAction } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";

/** Send a transaction through the action callback and return its hash. */
export async function executeTx(
  actionCallback: (action: Action) => Promise<unknown>,
  action: TransactionAction,
  chainId: number,
): Promise<string> {
  action.chainId = chainId;
  const result = await actionCallback(action);
  const hash =
    typeof result === "string" ? result : (result as any)?.transactionHash;
  if (typeof hash !== "string") {
    throw new ErrorException(
      "couldn't obtain the transaction hash from the wallet",
    );
  }
  return hash;
}

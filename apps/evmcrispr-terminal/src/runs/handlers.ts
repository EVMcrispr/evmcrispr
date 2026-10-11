import type { ActionHandlers } from "@evmcrispr/core";
import type { Action } from "@evmcrispr/sdk";
import type SafeAppProvider from "@safe-global/safe-apps-sdk";
import { NotPassed } from "./wallet-guard";

/** Whether sending the action asks the wallet for something: a signature,
 *  a transaction, a batch, a change of chain. Read-only calls, RPC and
 *  terminal actions never do, so a paused run lets them through.
 *
 *  This reads what the action says about itself, so it only ever saves a
 *  pause: it cannot open the wallet. A request made for an action that
 *  was let through here is refused by the wallet guard, and a test pins
 *  that the core takes no wallet for these. */
export function reachesWallet(action: Action): boolean {
  if (!("type" in action)) return !action.readOnly;
  return (
    action.type === "batched" ||
    action.type === "smartBatch" ||
    action.type === "wallet"
  );
}

/** Safe apps can't use EIP-5792 batching — route batched actions through
 *  the Safe SDK instead. Non-Safe runs use the core default handler. */
export function makeSafeBatchedHandler(
  safeConnector: any,
  /** Asked right before the batch is handed to the Safe. */
  allows: () => boolean = () => true,
): ActionHandlers["batched"] {
  return async (batch, _ctx) => {
    const sdk = await safeConnector
      .getProvider()
      .then((provider: any) => provider.sdk as SafeAppProvider);
    if (!sdk) throw new Error("Safe SDK not available");

    const chainId = await safeConnector.getChainId();
    const { actions } = batch;
    if (
      actions.some((action) => action.operation === 1 || action.plannedCall)
    ) {
      throw new Error(
        "The Safe Apps SDK cannot submit smart delegatecalls. Connect an owner wallet and use safe:propose <safe> !(...) or safe:execute <safe> !(...).",
      );
    }

    if (
      batch.chainId !== chainId ||
      actions.find(
        (action) => action.chainId !== undefined && action.chainId !== chainId,
      )
    ) {
      throw new Error("Safe does not support switching chains");
    }

    const callableActions = actions.filter((action) => action.to !== undefined);
    if (callableActions.length !== actions.length) {
      throw new Error("Contract deployments cannot be executed in batch mode");
    }

    // The Safe SDK is not the wallet client, so the guard does not see
    // this request: it is asked here, at the last moment.
    if (!allows()) throw new NotPassed("safe.txs.send");
    const sent = await sdk.txs.send({
      txs: callableActions.map((action) => ({
        to: action.to as `0x${string}`,
        data: action.data,
        value: String(action.value || "0"),
      })),
    });
    // The Safe only queued the batch: its owners execute it later. The
    // transaction box says so, and boxes following the batch do not treat
    // it as mined.
    const safeTxHash: string | undefined = sent?.safeTxHash;
    return {
      status: "queued",
      reason: safeTxHash
        ? `Queued in the Safe as ${safeTxHash}`
        : "Queued in the Safe",
    };
  };
}

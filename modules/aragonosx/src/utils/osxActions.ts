import type { Action, TransactionAction } from "@evmcrispr/sdk";
import { ErrorException, isTransactionAction } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";

/** The `Action` struct executed by `DAO.execute` and carried by proposals. */
export interface OsxAction {
  to: Address;
  value: bigint;
  data: Hex;
}

/**
 * Convert block actions into OSx `Action` structs, rejecting anything a DAO
 * cannot execute (non-transaction actions, deployments, delegatecalls).
 */
export function toOsxActions(
  actions: Action[],
  commandName: string,
): OsxAction[] {
  return actions.map((action) => {
    if (!isTransactionAction(action)) {
      throw new ErrorException(
        `can't use non-transaction actions inside a ${commandName} command`,
      );
    }
    const { to, value, data, operation } = action as TransactionAction;
    if (!to) {
      throw new ErrorException(
        `can't deploy contracts inside a ${commandName} command`,
      );
    }
    if (operation === 1) {
      throw new ErrorException(
        `can't use delegatecall actions inside a ${commandName} command`,
      );
    }
    return { to, value: value ?? 0n, data: data ?? "0x" };
  });
}

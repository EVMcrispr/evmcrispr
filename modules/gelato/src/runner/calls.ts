import type { Action, Address } from "@evmcrispr/sdk";
import {
  ErrorException,
  isBatchedAction,
  isRpcAction,
  isTerminalAction,
  isTransactionAction,
  isWalletAction,
} from "@evmcrispr/sdk";
import type { Hex } from "viem";

/** One call the dedicated msg.sender executes; `value` in wei as a decimal
 *  string, the shape Gelato's Web3 Function result takes. */
export interface RunnerCall {
  to: Address;
  data: Hex;
  value?: string;
}

const sameAddress = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();

/**
 * Turn the actions a script produced into the calls a Gelato task executes
 * from `executor` (the dedicated msg.sender). Anything that is not a plain
 * contract call from the executor has no counterpart in a task and is
 * rejected with the reason.
 */
export function actionsToCalls(
  actions: Action[],
  executor: Address,
): RunnerCall[] {
  const calls: RunnerCall[] = [];
  for (const action of actions) {
    if (isBatchedAction(action)) {
      if (!sameAddress(action.from, executor)) {
        throw new ErrorException(
          `a batch from ${action.from} cannot run from the dedicated msg.sender ${executor}`,
        );
      }
      calls.push(...actionsToCalls(action.actions, executor));
      continue;
    }
    if (isWalletAction(action)) {
      throw new ErrorException(
        action.method === "wallet_switchEthereumChain" ||
          action.method === "wallet_addEthereumChain"
          ? "switching chains is not supported: a Gelato task runs on the chain it was created on"
          : `wallet requests (${action.method}) are not supported in a Gelato task`,
      );
    }
    if (isRpcAction(action)) {
      throw new ErrorException(
        `${action.method} is not supported in a Gelato task: there is no fork to act on`,
      );
    }
    if (isTerminalAction(action)) {
      throw new ErrorException(
        `${action.command} is not supported in a Gelato task`,
      );
    }
    if (!isTransactionAction(action)) {
      throw new ErrorException("unsupported action in a Gelato task");
    }
    if (action.readOnly) {
      throw new ErrorException(
        "assertions are not supported in a Gelato task: guard with if/exit instead",
      );
    }
    if (!action.to) {
      throw new ErrorException(
        "contract creation is not supported in a Gelato task: deploy first and schedule calls to the deployed contract",
      );
    }
    if (action.from && !sameAddress(action.from, executor)) {
      throw new ErrorException(
        `a call from ${action.from} cannot run from the dedicated msg.sender ${executor}`,
      );
    }
    const data = action.data ?? "0x";
    if (data.length < 10) {
      throw new ErrorException(
        "plain ETH transfers are not supported in a Gelato task: the dedicated msg.sender only executes contract calls",
      );
    }
    const call: RunnerCall = { to: action.to, data };
    if (action.value && action.value > 0n) call.value = action.value.toString();
    calls.push(call);
  }
  return calls;
}

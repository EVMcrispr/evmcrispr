import type { Address } from "viem";

/**
 * An on-chain transaction action (e.g. contract call, token transfer, deployment).
 */
export interface TransactionAction {
  /**
   * The recipient address.
   */
  to: Address;
  /**
   * The encoded action. It can be conceived of as contract function calls.
   */
  data?: `0x${string}`;
  /**
   * The ether which needs to be sent along with the action (in wei).
   */
  value?: bigint;
  /**
   * The sender address. It can only be used in contexts where you can choose who is sending the transaction.
   */
  from?: Address;
  /**
   * The chain ID for the transaction.
   */
  chainId?: number;
  /**
   * The gas limit for the transaction (maximum gas units to consume).
   */
  gas?: bigint;
  /**
   * The maximum total fee per gas (base fee + priority fee) for EIP-1559 transactions (in wei).
   */
  maxFeePerGas?: bigint;
  /**
   * The maximum priority fee per gas (tip to the validator) for EIP-1559 transactions (in wei).
   */
  maxPriorityFeePerGas?: bigint;
  /**
   * The transaction nonce (overrides automatic nonce management).
   */
  nonce?: number;
}

/**
 * An atomic batch of transaction actions. All actions must share the same chain and sender.
 * Executed via sendCalls (EOA) or Multisend (Safe).
 */
export interface BatchedAction {
  type: "batched";
  /**
   * The chain ID shared by all actions in the batch.
   */
  chainId: number;
  /**
   * The sender address shared by all actions in the batch.
   */
  from: Address;
  /**
   * The transaction actions to execute atomically.
   */
  actions: TransactionAction[];
}

/**
 * A request to the wallet provider (e.g. switch chain, sign message).
 */
export interface WalletAction {
  type: "wallet";
  method: string;
  params: any[];
}

/**
 * A request to the RPC node (e.g. evm_mine, evm_increaseTime).
 */
export interface RpcAction {
  type: "rpc";
  method: string;
  params: any[];
}

/**
 * A client-side terminal action (e.g. real-time wait, display message).
 */
export interface TerminalAction {
  type: "terminal";
  command: string;
  args: Record<string, unknown>;
}

export type Action =
  | TransactionAction
  | BatchedAction
  | WalletAction
  | RpcAction
  | TerminalAction;

export function isTransactionAction(
  action: Action,
): action is TransactionAction {
  return !("type" in action);
}

export function isBatchedAction(action: Action): action is BatchedAction {
  return "type" in action && action.type === "batched";
}

export function isWalletAction(action: Action): action is WalletAction {
  return "type" in action && action.type === "wallet";
}

export function isRpcAction(action: Action): action is RpcAction {
  return "type" in action && action.type === "rpc";
}

export function isTerminalAction(action: Action): action is TerminalAction {
  return "type" in action && action.type === "terminal";
}

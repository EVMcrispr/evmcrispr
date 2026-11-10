import type { Address } from "viem";
import type {
  PlannedCall,
  SmartBatchAction,
  SmartBatchPlan,
} from "../onchain/smart-types";

export type { SmartBatchAction } from "../onchain/smart-types";

/**
 * An on-chain transaction action (e.g. contract call, token transfer, deployment).
 */
export interface TransactionAction {
  /** Review-only compiler plan; never part of signed transaction fields. */
  executionPlan?: SmartBatchPlan;
  /** Compiler-only call descriptor. Executors must reject unlowered calls. */
  plannedCall?: PlannedCall;
  /** Receipt event outcome required by the command that built this action. */
  receiptCheck?: {
    address: Address;
    successTopic: `0x${string}`;
    failureTopic: `0x${string}`;
    /** Match the first indexed argument, or first data word for unindexed events. */
    eventIdentifier?: `0x${string}`;
  };
  /**
   * The recipient address. Omit (`undefined`) for contract deployments via CREATE.
   */
  to?: Address;
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
   * Submit the signed transaction through this JSON-RPC endpoint instead of
   * the chain's configured transport (e.g. a rollup's cross-chain ingress).
   * Honoured when the executor holds a local signing key; with an injected
   * wallet the transaction goes out through the wallet's own RPC.
   */
  rpcUrl?: string;
  /**
   * The transaction composes with another chain (it calls a cross-chain
   * proxy, or wraps a call that does). On a chain whose gateway is not the
   * chain's own RPC (`ChainGatewayDef`: a settlement layer viem knows), only
   * a transaction marked so is shown to the gateway for a price: an
   * ordinary one is nobody else's business before it is broadcast.
   */
  crossChain?: boolean;
  /**
   * The gas limit for the transaction (maximum gas units to consume).
   */
  gas?: bigint;
  /**
   * The gas limit to send with when nothing else sizes the transaction:
   * it sets no `gas` and its gateway quotes none. A command whose
   * transaction the sending chain cannot estimate (a cross-chain call)
   * leaves `gas` to the gateway's quote and gives its own estimate here.
   */
  fallbackGas?: bigint;
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
  /**
   * How the action must be executed: 0 = CALL (default), 1 = DELEGATECALL.
   * Only meaningful inside execution contexts that support delegatecall
   * (e.g. a Safe transaction); a plain EOA transaction cannot carry it.
   */
  operation?: 0 | 1;
  /**
   * When executed standalone, run as a read-only `eth_call` instead of a write
   * transaction. The call must not revert for the action to succeed (used by
   * on-chain assertions, whose contracts revert on failure). Inside a batch the
   * flag is ignored and the call runs atomically, so a failing assertion reverts
   * the whole batch.
   */
  readOnly?: boolean;
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

/** A call a module action makes, as its description shows it. */
export interface ModuleActionCall {
  to: Address;
  data: `0x${string}`;
  value: bigint;
}

/**
 * What a module says its action does, for a host's review. Host-neutral:
 * plain strings (a host escapes them) and raw calls (a host decodes them).
 */
export interface ModuleActionDescription {
  /** The one-line form, for lists. */
  title: string;
  detail: string;
  meta: string;
  warning?: string;
  /** What it runs, in order. */
  steps: { label: string; call?: ModuleActionCall }[];
  /** What the description cannot say, said plainly. */
  notes: string[];
}

/**
 * An action a module owns: the module describes it when it is made, and
 * sends it (core's `module` handler loads the module and calls its
 * `send`). `data` must survive a structured clone (the worker boundary).
 */
export interface ModuleAction<D = unknown> {
  type: "module";
  module: string;
  kind: string;
  chainId: number;
  from: Address;
  data: D;
  description: ModuleActionDescription;
}

/**
 * A request to the wallet provider (e.g. switch chain, sign message).
 */
export interface WalletAction {
  executionPlan?: SmartBatchPlan;
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
  | SmartBatchAction
  | BatchedAction
  | ModuleAction
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

export function isSmartBatchAction(action: Action): action is SmartBatchAction {
  return "type" in action && action.type === "smartBatch";
}

export function isModuleAction(action: Action): action is ModuleAction {
  return "type" in action && action.type === "module";
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

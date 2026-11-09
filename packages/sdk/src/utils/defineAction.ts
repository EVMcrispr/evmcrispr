import type {
  Address,
  Hash,
  Hex,
  PublicClient,
  Transport,
  WalletClient,
} from "viem";
import type { ModuleAction, ModuleActionDescription } from "../types/actions";

/** What a module action's `send` is given: the host's wallet and clients,
 *  never a host type. Core passes its handler context as it is. */
export interface ModuleActionSendCtx {
  walletClient: WalletClient;
  getPublicClient(chainId?: number): PublicClient;
  onLog(message: string): void;
  signal?: AbortSignal;
  /** Host-configured transports, keyed by chain id. */
  transports?: Record<number, Transport>;
  /** The action was sent: its hash, for the action's box. */
  onSent?(hash: Hash): void;
}

/** One top-level call of a simulated action. */
export interface SimCallResult {
  /** False: reverted or halted. */
  success: boolean;
  returnData: Hex;
  /** Execution gas, without the intrinsic gas of a transaction. */
  gasUsed: bigint;
  logs: { address: Hex; topics: Hex[]; data: Hex }[];
  /** The revert or halt, when not a success. */
  error?: string;
}

/** What an extra opcode does, decided by the module: the backend pops the
 *  operands and applies the answer. */
export type SimOpcodeResult =
  | { push: bigint }
  | { write: { offset: bigint; data: Hex } }
  | { return: { offset: bigint; size: bigint } }
  | { fail: string };

/** An opcode a module's simulation adds for the calls it runs. `run` is
 *  synchronous and may be run again for the same call (a backend can
 *  replay a call after reading missing state). */
export interface SimOpcode {
  opcode: number;
  name: string;
  /** Stack operands it pops, top first. */
  pops: number;
  run(input: {
    /** The executing account (under a delegatecall, the caller's). */
    address: Address;
    operands: bigint[];
    isStatic: boolean;
  }): SimOpcodeResult;
}

/** What a transaction changed, net: each value as it was before its first
 *  change, and as it is now; only those that differ. Each list is sorted
 *  ascending by address (slots then by slot). */
export interface SimStateChanges {
  balances: { address: Address; before: bigint; after: bigint }[];
  slots: { address: Address; slot: Hex; before: Hex; after: Hex }[];
  /** Code hashes. */
  codes: { address: Address; before: Hex; after: Hex }[];
}

/** What a simulation backend gives a module action's `simulate`. */
export interface ModuleActionSimCtx {
  chainId: number;
  blockNumber: bigint;
  timestamp: bigint;
  /** The base fee of the forked block: what a transaction that gives fees
   *  pays at least (`chargedFees`). */
  baseFee: bigint;
  /** One top-level call: no nonce change, no intrinsic gas, no fee. */
  call(args: {
    caller: Address;
    to: Address;
    data: Hex;
    value: bigint;
    gas: bigint;
    isStatic: boolean;
  }): Promise<SimCallResult>;
  checkpoint(): Promise<void>;
  commit(): Promise<void>;
  revert(): Promise<void>;
  /** The net changes since the first `checkpoint()` made through this
   *  context (what a POST_TX frame's TXTRACE reads). */
  stateChanges(): Promise<SimStateChanges>;
  getNonce(address: Address): Promise<bigint>;
  setNonce(address: Address, nonce: bigint): Promise<void>;
  getBalance(address: Address): Promise<bigint>;
  /** Sets an account's balance: what a module charges for a fee. */
  setBalance(address: Address, balance: bigint): Promise<void>;
  getCode(address: Address): Promise<Hex>;
  /** Whether an earlier call of this action reached `address` (EIP-2929):
   *  one action's calls share their warm addresses and slots, as one
   *  transaction's frames do. */
  isWarm(address: Address): boolean;
  /** Marks `address` warm for the action's later calls. */
  warm(address: Address): void;
  /** Runs `run` with these opcodes added to every call it makes. */
  withOpcodes<T>(
    opcodes: readonly SimOpcode[],
    run: () => Promise<T>,
  ): Promise<T>;
  /** The fork's synthetic hash for this action. */
  transactionHash: Hex;
  onLog(message: string): void;
}

/** What a simulated module action returns, as a fork records it. */
export interface SimulatedReceipt {
  status: "success";
  transactionHash: Hex;
  gasUsed?: bigint;
  logs: { address: Hex; topics: Hex[]; data: Hex; logIndex: number }[];
  [extra: string]: unknown;
}

export interface ModuleActionDef<D> {
  /** What a host's review shows. Called once, when the action is made. */
  describe(
    action: Omit<ModuleAction<D>, "description">,
  ): ModuleActionDescription;
  /** What executing the action does. */
  send(action: ModuleAction<D>, ctx: ModuleActionSendCtx): Promise<unknown>;
  /** What it does in a fork (`sim:fork`); without it, a fork refuses it. */
  simulate?(
    action: ModuleAction<D>,
    sim: ModuleActionSimCtx,
  ): Promise<SimulatedReceipt>;
}

export interface DefinedModuleAction<D> extends ModuleActionDef<D> {
  module: string;
  kind: string;
  /** The action, with its module's description. */
  create(fields: { chainId: number; from: Address; data: D }): ModuleAction<D>;
}

const defined = new Map<string, DefinedModuleAction<any>>();

/** A module action's definition, once its module's code is loaded. */
export function moduleActionDef(
  module: string,
  kind: string,
): DefinedModuleAction<unknown> | undefined {
  return defined.get(`${module}:${kind}`);
}

/**
 * A kind of action a module produces. List it in the module class's
 * `static readonly actions`, keyed by `kind`, so a host can send it.
 */
export function defineAction<D>(
  module: string,
  kind: string,
  def: ModuleActionDef<D>,
): DefinedModuleAction<D> {
  const action: DefinedModuleAction<D> = {
    ...def,
    module,
    kind,
    create(fields) {
      const action = { type: "module" as const, module, kind, ...fields };
      return { ...action, description: def.describe(action) };
    },
  };
  defined.set(`${module}:${kind}`, action);
  return action;
}

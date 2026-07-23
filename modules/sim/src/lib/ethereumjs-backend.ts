import { Common, Hardfork, Mainnet } from "@ethereumjs/common";
import { RPCBlockChain, RPCStateManager } from "@ethereumjs/statemanager";
import type { Account, Address as EthjsAddress } from "@ethereumjs/util";
import {
  bigIntToHex,
  bytesToHex,
  createAccount,
  createAddressFromString,
  createZeroAddress,
  hexToBytes,
} from "@ethereumjs/util";
import type { VM } from "@ethereumjs/vm";
import { createVM } from "@ethereumjs/vm";
import {
  type Action,
  ErrorException,
  isRpcAction,
  isTransactionAction,
  RevertError,
} from "@evmcrispr/sdk";
import { custom, keccak256, type Transport } from "viem";

export interface EthereumJSBackendOpts {
  upstreamRpcUrl: string;
  blockNumber?: number;
  chainId: number;
  /** Aborts in-flight upstream RPC fetches when the run is cancelled. */
  signal?: AbortSignal;
}

/**
 * Minimal receipt for a transaction executed in the in-memory VM — enough
 * for event captures and the fork's cross-chain relay scanner.
 */
export interface SyntheticReceipt {
  status: "success";
  blockNumber: bigint;
  logs: {
    address: `0x${string}`;
    topics: `0x${string}`[];
    data: `0x${string}`;
    logIndex: number;
  }[];
}

export interface EthereumJSBackend {
  transport: Transport;
  handleAction(action: Action): Promise<SyntheticReceipt | undefined>;
}

/** A stalled upstream (rate limiter that never responds, dead connection)
 *  would otherwise hang the simulation forever. */
const RPC_TIMEOUT_MS = 30_000;

/**
 * JSON-RPC fetch that surfaces `error` responses — @ethereumjs/util's
 * fetchFromProvider returns `json.result` without checking `json.error`,
 * turning upstream RPC failures into cryptic undefined-dereference
 * TypeErrors deep inside the VM.
 */
async function rpcFetch(
  url: string,
  method: string,
  params: unknown[],
  signal?: AbortSignal,
): Promise<any> {
  const timeout = AbortSignal.timeout(RPC_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
  } catch (err) {
    if (signal?.aborted) {
      throw new ErrorException("Execution cancelled");
    }
    if (timeout.aborted) {
      throw new ErrorException(
        `upstream RPC timed out after ${RPC_TIMEOUT_MS / 1000}s for ${method}`,
      );
    }
    throw err;
  }
  if (!res.ok) {
    throw new ErrorException(
      `upstream RPC returned HTTP ${res.status} for ${method}`,
    );
  }
  const json = await res.json();
  if (json.error) {
    throw new ErrorException(
      `upstream RPC rejected ${method}: ${json.error.message} (code ${json.error.code})`,
    );
  }
  return json.result;
}

/**
 * RPCStateManager fetches accounts via eth_getProof, which load-balanced
 * providers reject once the pinned fork block falls more than a few blocks
 * behind head ("distance to target block exceeds maximum proof window" on
 * DRPC Optimism, seconds after forking). The VM never verifies the proof,
 * so fetch balance/nonce/code directly instead.
 */
class ProofFreeStateManager extends RPCStateManager {
  signal?: AbortSignal;

  override async getAccountFromProvider(
    address: EthjsAddress,
  ): Promise<Account> {
    const params = [address.toString(), this._blockTag];
    const [balance, nonce, code] = await Promise.all([
      rpcFetch(this._provider, "eth_getBalance", params, this.signal),
      rpcFetch(this._provider, "eth_getTransactionCount", params, this.signal),
      rpcFetch(this._provider, "eth_getCode", params, this.signal),
    ]);
    return createAccount({
      balance: BigInt(balance),
      nonce: BigInt(nonce),
      codeHash: hexToBytes(keccak256(code as `0x${string}`)),
    });
  }
}

export async function createEthereumJSBackend(
  opts: EthereumJSBackendOpts,
): Promise<EthereumJSBackend> {
  const { upstreamRpcUrl, chainId, signal } = opts;

  // Prague enables EIP-7702, so calls to EOAs carrying a 0xef0100 delegation
  // designator resolve to the delegate's code (used for batch simulation).
  const common = new Common({ chain: Mainnet, hardfork: Hardfork.Prague });

  const blockTag: bigint | "earliest" = opts.blockNumber
    ? BigInt(opts.blockNumber)
    : await resolveLatestBlockNumber(upstreamRpcUrl, signal);

  const stateManager = new ProofFreeStateManager({
    provider: upstreamRpcUrl,
    blockTag,
    common,
  });
  stateManager.signal = signal;

  const rpcBlockChain = new RPCBlockChain(upstreamRpcUrl);
  type MockBlockchain = {
    getBlock(blockId: number): Promise<{ hash(): Uint8Array }>;
    putBlock(block: unknown): Promise<void>;
    shallowCopy(): MockBlockchain;
  };
  const blockchain: MockBlockchain = {
    getBlock: rpcBlockChain.getBlock.bind(rpcBlockChain),
    async putBlock() {},
    shallowCopy() {
      return blockchain;
    },
  };

  const vm = await createVM({ common, stateManager, blockchain });

  let currentBlockNumber = typeof blockTag === "bigint" ? blockTag : 0n;
  let timestampOffset = 0n;

  const baseTimestamp = await fetchBlockTimestamp(
    upstreamRpcUrl,
    currentBlockNumber,
    signal,
  );

  function getCurrentTimestamp(): bigint {
    return baseTimestamp + timestampOffset;
  }

  function makeBlockContext() {
    return {
      header: {
        number: currentBlockNumber,
        coinbase: createZeroAddress(),
        timestamp: getCurrentTimestamp(),
        difficulty: 0n,
        prevRandao: new Uint8Array(32),
        gasLimit: 30_000_000n,
        baseFeePerGas: 0n,
        getBlobGasPrice: () => undefined,
      },
    };
  }

  async function handleRpcAction(
    method: string,
    params: unknown[],
  ): Promise<void> {
    if (method === "evm_increaseTime") {
      const seconds = BigInt(params[0] as string);
      timestampOffset += seconds;
      return;
    }

    if (method.endsWith("_mine") || method === "evm_increaseBlocks") {
      const blocks = BigInt(params[0] as string);
      currentBlockNumber += blocks;
      return;
    }

    if (method.endsWith("_setBalance")) {
      const addr = createAddressFromString(params[0] as string);
      const balance = BigInt(params[1] as string);
      await stateManager.modifyAccountFields(addr, { balance });
      return;
    }

    if (method.endsWith("_setCode")) {
      const addr = createAddressFromString(params[0] as string);
      const code = hexToBytes(params[1] as `0x${string}`);
      await stateManager.putCode(addr, code);
      return;
    }

    if (method.endsWith("_setStorageAt")) {
      const addr = createAddressFromString(params[0] as string);
      const key = padToBytes32(hexToBytes(params[1] as `0x${string}`));
      const value = padToBytes32(hexToBytes(params[2] as `0x${string}`));
      await stateManager.putStorage(addr, key, value);
      return;
    }

    throw new ErrorException(
      `Unsupported RPC method in ethereumjs mode: ${method}`,
    );
  }

  async function handleTransactionAction(
    action: Action,
  ): Promise<SyntheticReceipt | undefined> {
    if (!isTransactionAction(action)) return undefined;

    const senderAddr = action.from
      ? createAddressFromString(action.from)
      : createZeroAddress();

    const toAddr = action.to ? createAddressFromString(action.to) : undefined;

    await vm.evm.journal.checkpoint();

    const result = await vm.evm.runCall({
      caller: senderAddr,
      to: toAddr,
      data: action.data ? hexToBytes(action.data) : undefined,
      value: action.value ?? 0n,
      gasLimit: action.gas ?? 30_000_000n,
      block: makeBlockContext(),
      skipBalance: true,
    });

    if (result.execResult.exceptionError) {
      await vm.evm.journal.revert();
      const returnValue = result.execResult.returnValue;
      const revertData =
        returnValue && returnValue.length > 0
          ? (bytesToHex(returnValue) as `0x${string}`)
          : undefined;
      throw new RevertError(
        `Transaction reverted: ${result.execResult.exceptionError.error}`,
        revertData,
      );
    }

    await vm.evm.journal.commit();

    const account = await stateManager.getAccount(senderAddr);
    if (account) {
      await stateManager.modifyAccountFields(senderAddr, {
        nonce: account.nonce + 1n,
      });
    }

    return {
      status: "success",
      blockNumber: currentBlockNumber,
      logs: (result.execResult.logs ?? []).map(
        ([address, topics, data], logIndex) => ({
          address: bytesToHex(address) as `0x${string}`,
          topics: topics.map((t) => bytesToHex(t) as `0x${string}`),
          data: bytesToHex(data) as `0x${string}`,
          logIndex,
        }),
      ),
    };
  }

  async function handleAction(
    action: Action,
  ): Promise<SyntheticReceipt | undefined> {
    if (isRpcAction(action)) {
      await handleRpcAction(action.method, action.params);
      return undefined;
    }
    if (isTransactionAction(action)) {
      return handleTransactionAction(action);
    }
    return undefined;
  }

  const transport = custom({
    async request({ method, params }: { method: string; params?: any[] }) {
      const p = params ?? [];
      switch (method) {
        case "eth_call":
          return await handleEthCall(vm, stateManager, p, makeBlockContext());
        case "eth_getBalance":
          return await handleGetBalance(stateManager, p);
        case "eth_getCode":
          return await handleGetCode(stateManager, p);
        case "eth_getStorageAt":
          return await handleGetStorageAt(stateManager, p);
        case "eth_blockNumber":
          return bigIntToHex(currentBlockNumber);
        case "eth_chainId":
          return bigIntToHex(BigInt(chainId));
        default:
          return await rpcFetch(upstreamRpcUrl, method, p, signal);
      }
    },
  });

  return { transport, handleAction };
}

async function handleEthCall(
  vm: VM,
  stateManager: RPCStateManager,
  params: any[],
  blockContext: ReturnType<() => { header: any }>,
): Promise<string> {
  const callObj = params[0] ?? {};
  await stateManager.checkpoint();
  try {
    const result = await vm.evm.runCall({
      caller: callObj.from
        ? createAddressFromString(callObj.from)
        : createZeroAddress(),
      to: callObj.to ? createAddressFromString(callObj.to) : undefined,
      data: callObj.data ? hexToBytes(callObj.data) : undefined,
      value: callObj.value ? BigInt(callObj.value) : 0n,
      gasLimit: callObj.gas ? BigInt(callObj.gas) : 30_000_000n,
      block: blockContext,
      skipBalance: true,
    });
    if (result.execResult.exceptionError) {
      throw new Error(result.execResult.exceptionError.error);
    }
    return bytesToHex(result.execResult.returnValue);
  } finally {
    await stateManager.revert();
  }
}

async function handleGetBalance(
  stateManager: RPCStateManager,
  params: any[],
): Promise<string> {
  const addr = createAddressFromString(params[0]);
  const account = await stateManager.getAccount(addr);
  return account ? bigIntToHex(account.balance) : "0x0";
}

async function handleGetCode(
  stateManager: RPCStateManager,
  params: any[],
): Promise<string> {
  const addr = createAddressFromString(params[0]);
  const code = await stateManager.getCode(addr);
  return bytesToHex(code);
}

async function handleGetStorageAt(
  stateManager: RPCStateManager,
  params: any[],
): Promise<string> {
  const addr = createAddressFromString(params[0]);
  const key = padToBytes32(hexToBytes(params[1]));
  const value = await stateManager.getStorage(addr, key);
  return bytesToHex(value);
}

function padToBytes32(input: Uint8Array): Uint8Array {
  if (input.length === 32) return input;
  const padded = new Uint8Array(32);
  padded.set(input, 32 - input.length);
  return padded;
}

async function resolveLatestBlockNumber(
  rpcUrl: string,
  signal?: AbortSignal,
): Promise<bigint> {
  const result = await rpcFetch(rpcUrl, "eth_blockNumber", [], signal);
  return BigInt(result);
}

async function fetchBlockTimestamp(
  rpcUrl: string,
  blockNumber: bigint,
  signal?: AbortSignal,
): Promise<bigint> {
  const block = await rpcFetch(
    rpcUrl,
    "eth_getBlockByNumber",
    [bigIntToHex(blockNumber), false],
    signal,
  );
  if (block == null) {
    throw new ErrorException(
      `Block ${blockNumber} not found on upstream RPC (${rpcUrl}). ` +
        `The RPC may not serve this block or may be rate-limiting requests.`,
    );
  }
  return BigInt(block.timestamp);
}

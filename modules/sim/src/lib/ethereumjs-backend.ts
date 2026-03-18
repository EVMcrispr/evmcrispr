import { Common, Hardfork, Mainnet } from "@ethereumjs/common";
import { RPCBlockChain, RPCStateManager } from "@ethereumjs/statemanager";
import {
  bigIntToHex,
  bytesToHex,
  createAddressFromString,
  createZeroAddress,
  fetchFromProvider,
  hexToBytes,
} from "@ethereumjs/util";
import type { VM } from "@ethereumjs/vm";
import { createVM } from "@ethereumjs/vm";
import {
  type Action,
  ErrorException,
  isRpcAction,
  isTransactionAction,
} from "@evmcrispr/sdk";
import { custom, type Transport } from "viem";

export interface EthereumJSBackendOpts {
  upstreamRpcUrl: string;
  blockNumber?: number;
  chainId: number;
}

export interface EthereumJSBackend {
  transport: Transport;
  handleAction(action: Action): Promise<void>;
}

export async function createEthereumJSBackend(
  opts: EthereumJSBackendOpts,
): Promise<EthereumJSBackend> {
  const { upstreamRpcUrl, chainId } = opts;

  const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });

  const blockTag: bigint | "earliest" = opts.blockNumber
    ? BigInt(opts.blockNumber)
    : await resolveLatestBlockNumber(upstreamRpcUrl);

  const stateManager = new RPCStateManager({
    provider: upstreamRpcUrl,
    blockTag,
    common,
  });

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

  async function handleTransactionAction(action: Action): Promise<void> {
    if (!isTransactionAction(action)) return;

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
      throw new ErrorException(
        `Transaction reverted: ${result.execResult.exceptionError.error}`,
      );
    }

    await vm.evm.journal.commit();

    const account = await stateManager.getAccount(senderAddr);
    if (account) {
      await stateManager.modifyAccountFields(senderAddr, {
        nonce: account.nonce + 1n,
      });
    }
  }

  async function handleAction(action: Action): Promise<void> {
    if (isRpcAction(action)) {
      await handleRpcAction(action.method, action.params);
    } else if (isTransactionAction(action)) {
      await handleTransactionAction(action);
    }
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
          return await fetchFromProvider(upstreamRpcUrl, {
            method,
            params: p,
          });
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

async function resolveLatestBlockNumber(rpcUrl: string): Promise<bigint> {
  const result = await fetchFromProvider(rpcUrl, {
    method: "eth_blockNumber",
    params: [],
  });
  return BigInt(result);
}

async function fetchBlockTimestamp(
  rpcUrl: string,
  blockNumber: bigint,
): Promise<bigint> {
  const block = await fetchFromProvider(rpcUrl, {
    method: "eth_getBlockByNumber",
    params: [bigIntToHex(blockNumber), false],
  });
  if (block == null) {
    throw new ErrorException(
      `Block ${blockNumber} not found on upstream RPC (${rpcUrl}). ` +
        `The RPC may not serve this block or may be rate-limiting requests.`,
    );
  }
  return BigInt(block.timestamp);
}

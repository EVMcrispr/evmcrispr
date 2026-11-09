import { createCustomCommon, Hardfork, Mainnet } from "@ethereumjs/common";
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
  chargedFees,
  describeRevertData,
  ErrorException,
  isRpcAction,
  isTransactionAction,
  type ModuleActionSimCtx,
  RevertError,
  type SimStateChanges,
  unpaidFeeError,
} from "@evmcrispr/sdk";
import { custom, getAddress, type Hex, keccak256 } from "viem";
import {
  type BalanceChange,
  fetchForkBlock,
  padToBytes32,
  resolveLatestBlockNumber,
  rpcFetch,
  type SimBackend,
  type SimBackendOpts,
  type SyntheticReceipt,
  syntheticTxHash,
} from "./backend";
import {
  customOpcodes,
  freeOpcodes,
  type OpcodeSlot,
} from "./ethereumjs-opcodes";

/**
 * RPCStateManager fetches accounts via eth_getProof, which load-balanced
 * providers reject once the pinned fork block falls more than a few blocks
 * behind head ("distance to target block exceeds maximum proof window" on
 * DRPC Optimism, seconds after forking). The VM never verifies the proof,
 * so fetch balance/nonce/code directly instead.
 */
class ProofFreeStateManager extends RPCStateManager {
  signal?: AbortSignal;
  /** While a transaction runs: each account's balance before the first
   *  write to it. Every change of an account, whether a call's value, a
   *  selfdestruct or a fee, is written through `putAccount` or
   *  `deleteAccount`, so these are all the accounts it can have changed. */
  recording?: Map<string, { address: EthjsAddress; before: bigint }>;

  async #record(address: EthjsAddress) {
    const key = address.toString();
    if (!this.recording || this.recording.has(key)) return;
    const before = (await this.getAccount(address))?.balance ?? 0n;
    this.recording.set(key, { address, before });
  }

  /** Since a module action's first checkpoint: each account's balance and
   *  code hash, and each slot's value, before their first write
   *  (`stateChanges`). */
  trace?: {
    accounts: Map<
      string,
      { address: EthjsAddress; balance: bigint; code: Hex }
    >;
    slots: Map<string, { address: EthjsAddress; key: Uint8Array; before: Hex }>;
  };

  /** Slots whose value is being read for the trace. */
  #reading = new Set<string>();

  async #traceAccount(address: EthjsAddress) {
    const key = address.toString();
    if (!this.trace || this.trace.accounts.has(key)) return;
    const account = await this.getAccount(address);
    // The code itself, hashed: putCode caches code without updating the
    // account's codeHash (a CREATE goes through putCode alone).
    this.trace.accounts.set(key, {
      address,
      balance: account?.balance ?? 0n,
      code: keccak256(await this.getCode(address)),
    });
  }

  override async putAccount(
    address: EthjsAddress,
    account?: Account,
  ): Promise<void> {
    await this.#record(address);
    await this.#traceAccount(address);
    return super.putAccount(address, account);
  }

  override async deleteAccount(address: EthjsAddress): Promise<void> {
    await this.#record(address);
    await this.#traceAccount(address);
    return super.deleteAccount(address);
  }

  override async putCode(
    address: EthjsAddress,
    value: Uint8Array,
  ): Promise<void> {
    await this.#traceAccount(address);
    return super.putCode(address, value);
  }

  override async putStorage(
    address: EthjsAddress,
    key: Uint8Array,
    value: Uint8Array,
  ): Promise<void> {
    const id = `${address.toString()}:${bytesToHex(key)}`;
    // Reading the slot's value can itself store it (RPCStateManager caches
    // what it fetches through putStorage): that store is not a write.
    if (this.trace && !this.trace.slots.has(id) && !this.#reading.has(id)) {
      this.#reading.add(id);
      try {
        const before = bytesToHex(
          padToBytes32(await this.getStorage(address, key)),
        ) as Hex;
        this.trace.slots.set(id, { address, key, before });
      } finally {
        this.#reading.delete(id);
      }
    }
    return super.putStorage(address, key, value);
  }

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
  opts: SimBackendOpts,
): Promise<SimBackend> {
  const { upstreamRpcUrl, chainId, signal } = opts;

  // Prague enables EIP-7702, so calls to EOAs carrying a 0xef0100 delegation
  // designator resolve to the delegate's code (used for batch simulation).
  // Mainnet's rules on the forked chain's id: CHAINID answers it, so what is
  // signed over the chain (EIP-712 domains, permits) checks as it would there.
  const common = createCustomCommon({ chainId }, Mainnet, {
    hardfork: Hardfork.Prague,
  });

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

  // A module action's simulation adds opcodes for the calls it runs.
  const opcodeSlot: OpcodeSlot = {};
  const freeBytes = freeOpcodes(common);
  const vm = await createVM({
    common,
    stateManager,
    blockchain,
    evmOpts: { customOpcodes: customOpcodes(common, opcodeSlot) },
  });

  let currentBlockNumber = typeof blockTag === "bigint" ? blockTag : 0n;
  let timestampOffset = 0n;

  const { timestamp: baseTimestamp, baseFee } = await fetchForkBlock(
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
        baseFeePerGas: baseFee,
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

  let txCounter = 0;

  async function handleTransactionAction(
    action: Action,
  ): Promise<SyntheticReceipt | undefined> {
    if (!isTransactionAction(action)) return undefined;

    const senderAddr = action.from
      ? createAddressFromString(action.from)
      : createZeroAddress();

    const toAddr = action.to ? createAddressFromString(action.to) : undefined;

    // Honor an explicit nonce override (--nonce): adopt it as the account
    // nonce so CREATE addresses derive from it. Real nodes reject gaps; the
    // sim instead accepts whatever the user pinned.
    if (action.nonce !== undefined) {
      await stateManager.modifyAccountFields(senderAddr, {
        nonce: BigInt(action.nonce),
      });
    }

    // Checked before anything runs, as a node checks it.
    const fees = chargedFees(action, baseFee);

    await vm.evm.journal.checkpoint();
    stateManager.recording = new Map();

    const result = await vm.evm.runCall({
      gasPrice: fees?.gasPrice ?? 0n,
      caller: senderAddr,
      to: toAddr,
      data: action.data ? hexToBytes(action.data) : undefined,
      value: action.value ?? 0n,
      gasLimit: action.gas ?? 30_000_000n,
      block: makeBlockContext(),
      skipBalance: true,
    });

    if (result.execResult.exceptionError) {
      stateManager.recording = undefined;
      await vm.evm.journal.revert();
      const returnValue = result.execResult.returnValue;
      const revertData =
        returnValue && returnValue.length > 0
          ? (bytesToHex(returnValue) as `0x${string}`)
          : undefined;
      // The decoded on-chain reason (Error(string), Panic, custom error) is
      // self-descriptive; fall back to the generic prefix with EthereumJS's
      // internal exception kind (e.g. "revert") when there's no data.
      const reason = describeRevertData(revertData);
      throw new RevertError(
        reason ??
          `Transaction reverted: ${result.execResult.exceptionError.error}`,
        revertData,
      );
    }

    // A call's execution gas, plus what a transaction pays before it
    // runs: the base cost and its calldata, counted at the dearer rate.
    const gasUsed =
      result.execResult.executionGasUsed +
      21_000n +
      16n * BigInt(action.data ? (action.data.length - 2) / 2 : 0);

    // runCall charges no fee: one that the transaction gives is what its
    // gas used costs, taken here, before the commit.
    if (fees) {
      const fee = gasUsed * fees.gasPrice;
      const balance =
        (await stateManager.getAccount(senderAddr))?.balance ?? 0n;
      if (balance < fee) {
        stateManager.recording = undefined;
        await vm.evm.journal.revert();
        throw unpaidFeeError(
          chainId,
          getAddress(senderAddr.toString()),
          fee,
          balance,
        );
      }
      await stateManager.modifyAccountFields(senderAddr, {
        balance: balance - fee,
      });
    }

    // runCall already bumped the sender nonce (depth-0 behavior mirroring a
    // real tx), so the journal commit persists it — no manual increment.
    await vm.evm.journal.commit();
    const recorded = stateManager.recording;
    stateManager.recording = undefined;
    const balanceChanges: BalanceChange[] = [];
    for (const { address, before } of recorded?.values() ?? []) {
      const after = (await stateManager.getAccount(address))?.balance ?? 0n;
      if (after !== before)
        balanceChanges.push({
          address: address.toString() as `0x${string}`,
          before,
          after,
        });
    }

    return {
      status: "success",
      blockNumber: currentBlockNumber,
      transactionHash: syntheticTxHash(action, txCounter++),
      contractAddress: result.createdAddress
        ? (result.createdAddress.toString() as `0x${string}`)
        : undefined,
      gasUsed,
      balanceChanges,
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
        case "eth_getTransactionCount":
          // Pin to the fork block: upstream may have advanced past it, and
          // CREATE-address predictions must match the nonce the fork's state
          // was seeded with. Deliberately frozen (in-fork txs don't show up) —
          // callers layer their own offset for queued deployments.
          return await rpcFetch(
            upstreamRpcUrl,
            method,
            [
              p[0],
              typeof blockTag === "bigint" ? bigIntToHex(blockTag) : blockTag,
            ],
            signal,
          );
        default:
          return await rpcFetch(upstreamRpcUrl, method, p, signal);
      }
    },
  });

  const address = (a: string) => createAddressFromString(a);

  function simContext(
    action: Action,
    { onLog }: { onLog: (message: string) => void },
  ): ModuleActionSimCtx {
    // The action starts with nothing warm, as a transaction does; its calls
    // then share what they warm (runCall keeps the journal's access sets).
    // The EVM's Journal (its interface type leaves the warm sets out).
    let tracing = false;
    const journal = vm.evm.journal as unknown as {
      journalHeight: number;
      isWarmedAddress(address: Uint8Array): boolean;
      addWarmedAddress(address: Uint8Array): void;
    };
    if (journal.journalHeight === 0) vm.evm.journal.cleanJournal();
    return {
      chainId,
      blockNumber: currentBlockNumber,
      timestamp: getCurrentTimestamp(),
      baseFee,
      transactionHash: syntheticTxHash(action, txCounter++),
      onLog,
      async call({ caller, to, data, value, gas, isStatic }) {
        opcodeSlot.failure = undefined;
        const result = await vm.evm.runCall({
          caller: address(caller),
          to: address(to),
          data: hexToBytes(data),
          value,
          gasLimit: gas,
          isStatic,
          skipNonceIncrement: true,
          block: makeBlockContext(),
        });
        journal.addWarmedAddress(hexToBytes(to));
        journal.addWarmedAddress(hexToBytes(caller));
        const error = result.execResult.exceptionError;
        return {
          success: !error,
          returnData: bytesToHex(result.execResult.returnValue) as Hex,
          gasUsed: result.execResult.executionGasUsed,
          logs: (result.execResult.logs ?? []).map(
            ([address, topics, data]) => ({
              address: bytesToHex(address) as Hex,
              topics: topics.map((t) => bytesToHex(t) as Hex),
              data: bytesToHex(data) as Hex,
            }),
          ),
          error: error ? (opcodeSlot.failure ?? error.error) : undefined,
        };
      },
      checkpoint: () => {
        // The first checkpoint is the transaction's start: what changes
        // from here is what stateChanges() reports.
        if (!tracing) {
          tracing = true;
          stateManager.trace = { accounts: new Map(), slots: new Map() };
        }
        return vm.evm.journal.checkpoint();
      },
      async stateChanges() {
        const trace = stateManager.trace ?? {
          accounts: new Map(),
          slots: new Map(),
        };
        const order = (x: bigint, y: bigint) => (x < y ? -1 : x > y ? 1 : 0);
        const byAddress = (a: { address: Hex }, b: { address: Hex }) =>
          order(BigInt(a.address), BigInt(b.address));
        const balances: SimStateChanges["balances"] = [];
        const codes: SimStateChanges["codes"] = [];
        for (const before of trace.accounts.values()) {
          const now = await stateManager.getAccount(before.address);
          const address = getAddress(before.address.toString());
          const balance = now?.balance ?? 0n;
          const code = keccak256(await stateManager.getCode(before.address));
          if (balance !== before.balance)
            balances.push({ address, before: before.balance, after: balance });
          if (code !== before.code)
            codes.push({ address, before: before.code, after: code });
        }
        const slots: SimStateChanges["slots"] = [];
        for (const before of trace.slots.values()) {
          const after = bytesToHex(
            padToBytes32(
              await stateManager.getStorage(before.address, before.key),
            ),
          ) as Hex;
          if (after !== before.before)
            slots.push({
              address: getAddress(before.address.toString()),
              slot: bytesToHex(padToBytes32(before.key)) as Hex,
              before: before.before,
              after,
            });
        }
        balances.sort(byAddress);
        codes.sort(byAddress);
        slots.sort(
          (a, b) => byAddress(a, b) || order(BigInt(a.slot), BigInt(b.slot)),
        );
        return { balances, slots, codes };
      },
      commit: () => vm.evm.journal.commit(),
      revert: () => vm.evm.journal.revert(),
      async getNonce(a) {
        return (await stateManager.getAccount(address(a)))?.nonce ?? 0n;
      },
      async setNonce(a, nonce) {
        await stateManager.modifyAccountFields(address(a), { nonce });
      },
      async getBalance(a) {
        return (await stateManager.getAccount(address(a)))?.balance ?? 0n;
      },
      async setBalance(a, balance) {
        await stateManager.modifyAccountFields(address(a), { balance });
      },
      async getCode(a) {
        return bytesToHex(await stateManager.getCode(address(a))) as Hex;
      },
      isWarm: (a) => journal.isWarmedAddress(hexToBytes(a)),
      warm: (a) => journal.addWarmedAddress(hexToBytes(a)),
      async withOpcodes(opcodes, run) {
        for (const op of opcodes)
          if (!freeBytes.has(op.opcode))
            throw new ErrorException(
              `${op.name} (0x${op.opcode.toString(16)}) is an opcode this backend already defines`,
            );
        const previous = opcodeSlot.table;
        opcodeSlot.table = new Map(opcodes.map((op) => [op.opcode, op]));
        try {
          return await run();
        } finally {
          opcodeSlot.table = previous;
        }
      },
    };
  }

  return { transport, handleAction, simContext };
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
      const returnValue = result.execResult.returnValue;
      const revertData =
        returnValue && returnValue.length > 0
          ? (bytesToHex(returnValue) as `0x${string}`)
          : undefined;
      const reason = describeRevertData(revertData);
      throw new RevertError(
        reason ??
          `execution reverted: ${result.execResult.exceptionError.error}`,
        revertData,
      );
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

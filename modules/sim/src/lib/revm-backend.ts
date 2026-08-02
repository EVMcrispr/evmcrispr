import {
  type Action,
  describeRevertData,
  ErrorException,
  isRpcAction,
  isTransactionAction,
  RevertError,
} from "@evmcrispr/sdk";
import { custom, keccak256, numberToHex } from "viem";
import {
  fetchBlockTimestamp,
  resolveLatestBlockNumber,
  rpcFetch,
  type SimBackend,
  type SimBackendOpts,
  type SyntheticReceipt,
  syntheticTxHash,
} from "./backend";
import { loadRevm } from "./revm/load";

type Miss =
  | { type: "account"; address: `0x${string}` }
  | { type: "storage"; address: `0x${string}`; slot: `0x${string}` }
  | { type: "blockhash"; number: number }
  | { type: "codehash"; hash: `0x${string}` };

type Envelope =
  | { kind: "ok" }
  | { kind: "value"; value: `0x${string}` }
  | {
      kind: "success";
      returnData: `0x${string}`;
      gasUsed: number;
      logs: {
        address: `0x${string}`;
        topics: `0x${string}`[];
        data: `0x${string}`;
      }[];
    }
  | { kind: "revert"; revertData: `0x${string}` }
  | { kind: "halt"; reason: string }
  | { kind: "misses"; misses: Miss[] }
  | { kind: "error"; message: string };

/** Backstop for a buggy non-converging replay loop; each iteration normally
 *  resolves at least one new cache entry, so real scripts stay far below. */
const MAX_REPLAY_ITERATIONS = 512;

export async function createRevmBackend(
  opts: SimBackendOpts,
): Promise<SimBackend> {
  const { upstreamRpcUrl, chainId, signal } = opts;
  const revm = await loadRevm();

  const baseBlockNumber = opts.blockNumber
    ? BigInt(opts.blockNumber)
    : await resolveLatestBlockNumber(upstreamRpcUrl, signal);
  const baseTimestamp = await fetchBlockTimestamp(
    upstreamRpcUrl,
    baseBlockNumber,
    signal,
  );

  const fork = new revm.RevmFork(
    BigInt(chainId),
    baseBlockNumber,
    baseTimestamp,
  );
  // Fork state is read at the pinned block, mirroring RPCStateManager's blockTag.
  const blockTag = numberToHex(baseBlockNumber);
  /** Accounts already seeded (or mutated in-sim) — never re-fetch upstream,
   *  an overwrite would roll back simulated state. */
  const seededAccounts = new Set<string>();

  function assertOk(env: Envelope): void {
    if (env.kind === "error") throw new ErrorException(env.message);
  }

  async function fetchAndInsertAccount(address: `0x${string}`): Promise<void> {
    const key = address.toLowerCase();
    if (seededAccounts.has(key)) {
      throw new ErrorException(
        `revm replay loop made no progress on account ${address}`,
      );
    }
    const params = [address, blockTag];
    const [balance, nonce, code] = await Promise.all([
      rpcFetch(upstreamRpcUrl, "eth_getBalance", params, signal),
      rpcFetch(upstreamRpcUrl, "eth_getTransactionCount", params, signal),
      rpcFetch(upstreamRpcUrl, "eth_getCode", params, signal),
    ]);
    const env: Envelope = JSON.parse(
      fork.insertAccount(address, balance, BigInt(nonce), code),
    );
    assertOk(env);
    seededAccounts.add(key);
  }

  async function resolveMiss(miss: Miss): Promise<void> {
    switch (miss.type) {
      case "account":
        await fetchAndInsertAccount(miss.address);
        return;
      case "storage": {
        const value = await rpcFetch(
          upstreamRpcUrl,
          "eth_getStorageAt",
          [miss.address, miss.slot, blockTag],
          signal,
        );
        assertOk(
          JSON.parse(fork.insertStorage(miss.address, miss.slot, value)),
        );
        return;
      }
      case "blockhash": {
        // Blocks "mined" in-sim don't exist upstream; derive a stable
        // synthetic hash for them (anvil-style determinism is not required,
        // only self-consistency within the fork).
        const upstream =
          BigInt(miss.number) <= baseBlockNumber
            ? await rpcFetch(
                upstreamRpcUrl,
                "eth_getBlockByNumber",
                [numberToHex(BigInt(miss.number)), false],
                signal,
              )
            : null;
        const hash =
          upstream?.hash ??
          keccak256(numberToHex(BigInt(miss.number), { size: 32 }));
        assertOk(JSON.parse(fork.insertBlockHash(BigInt(miss.number), hash)));
        return;
      }
      case "codehash":
        // Unresolvable from JSON-RPC (no address context); indicates a
        // cache-seeding bug in the Rust side.
        throw new ErrorException(
          `revm backend requested code by hash ${miss.hash} — this is a bug`,
        );
    }
  }

  async function execWithReplay(run: () => string): Promise<Envelope> {
    for (let i = 0; i < MAX_REPLAY_ITERATIONS; i++) {
      if (signal?.aborted) throw new ErrorException("Execution cancelled");
      const env: Envelope = JSON.parse(run());
      if (env.kind !== "misses") {
        assertOk(env);
        return env;
      }
      for (const miss of env.misses) await resolveMiss(miss);
    }
    throw new ErrorException(
      `revm replay loop exceeded ${MAX_REPLAY_ITERATIONS} iterations`,
    );
  }

  /** Seed from/to up front: one parallel batch instead of serial cold misses. */
  async function prefetchAccounts(
    addresses: (`0x${string}` | undefined)[],
  ): Promise<void> {
    await Promise.all(
      addresses
        .filter((a): a is `0x${string}` => !!a)
        .filter((a) => !seededAccounts.has(a.toLowerCase()))
        .map((a) => fetchAndInsertAccount(a)),
    );
  }

  async function handleRpcAction(
    method: string,
    params: unknown[],
  ): Promise<void> {
    if (method === "evm_increaseTime") {
      fork.increaseTime(BigInt(params[0] as string));
      return;
    }
    if (method.endsWith("_mine") || method === "evm_increaseBlocks") {
      fork.mine(BigInt(params[0] as string));
      return;
    }
    if (method.endsWith("_setBalance")) {
      const [addr, balance] = params as [`0x${string}`, `0x${string}`];
      await execWithReplay(() => fork.setBalance(addr, balance));
      seededAccounts.add(addr.toLowerCase());
      return;
    }
    if (method.endsWith("_setCode")) {
      const [addr, code] = params as [`0x${string}`, `0x${string}`];
      await execWithReplay(() => fork.setCode(addr, code));
      seededAccounts.add(addr.toLowerCase());
      return;
    }
    if (method.endsWith("_setStorageAt")) {
      const [addr, slot, value] = params as `0x${string}`[];
      await execWithReplay(() => fork.setStorage(addr, slot, value));
      return;
    }
    throw new ErrorException(`Unsupported RPC method in revm mode: ${method}`);
  }

  let txCounter = 0;

  async function handleTransactionAction(
    action: Action,
  ): Promise<SyntheticReceipt | undefined> {
    if (!isTransactionAction(action)) return undefined;

    const from = action.from ?? `0x${"0".repeat(40)}`;
    await prefetchAccounts([from as `0x${string}`, action.to]);
    const tx = JSON.stringify({
      from,
      to: action.to,
      data: action.data,
      value: action.value !== undefined ? numberToHex(action.value) : undefined,
      gas: action.gas !== undefined ? numberToHex(action.gas) : undefined,
      nonce: action.nonce !== undefined ? numberToHex(action.nonce) : undefined,
    });

    const env = await execWithReplay(() => fork.transact(tx));
    if (env.kind === "revert") {
      // The decoded on-chain reason is self-descriptive; the generic prefix
      // is only a fallback for reverts that carry no data.
      const reason = describeRevertData(env.revertData);
      throw new RevertError(reason ?? "Transaction reverted", env.revertData);
    }
    if (env.kind === "halt") {
      throw new RevertError(`Transaction reverted: ${env.reason}`);
    }
    if (env.kind !== "success") {
      throw new ErrorException(
        `unexpected revm result: ${JSON.stringify(env)}`,
      );
    }

    return {
      status: "success",
      blockNumber: fork.blockNumber(),
      transactionHash: syntheticTxHash(action, txCounter++),
      logs: env.logs.map((log, logIndex) => ({ ...log, logIndex })),
    };
  }

  async function handleEthCall(params: any[]): Promise<string> {
    const callObj = params[0] ?? {};
    await prefetchAccounts([callObj.from, callObj.to]);
    const tx = JSON.stringify({
      from: callObj.from ?? `0x${"0".repeat(40)}`,
      to: callObj.to,
      data: callObj.data,
      value: callObj.value,
      gas: callObj.gas,
    });
    const env = await execWithReplay(() => fork.call(tx));
    if (env.kind === "revert") {
      const reason = describeRevertData(env.revertData);
      throw new RevertError(reason ?? "execution reverted", env.revertData);
    }
    if (env.kind === "halt") {
      throw new Error(`execution halted: ${env.reason}`);
    }
    if (env.kind !== "success") {
      throw new ErrorException(
        `unexpected revm result: ${JSON.stringify(env)}`,
      );
    }
    return env.returnData;
  }

  async function readValue(run: () => string): Promise<`0x${string}`> {
    const env = await execWithReplay(run);
    if (env.kind !== "value") {
      throw new ErrorException(
        `unexpected revm result: ${JSON.stringify(env)}`,
      );
    }
    return env.value;
  }

  const transport = custom({
    async request({ method, params }: { method: string; params?: any[] }) {
      const p = params ?? [];
      switch (method) {
        case "eth_call":
          return await handleEthCall(p);
        case "eth_getBalance":
          return await readValue(() => fork.getBalance(p[0]));
        case "eth_getCode":
          return await readValue(() => fork.getCode(p[0]));
        case "eth_getStorageAt": {
          const value = await readValue(() => fork.getStorage(p[0], p[1]));
          // eth_getStorageAt returns a full 32-byte word.
          return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
        }
        case "eth_blockNumber":
          return numberToHex(fork.blockNumber());
        case "eth_chainId":
          return numberToHex(chainId);
        case "eth_getTransactionCount":
          // Pin to the fork block: upstream may have advanced past it, and
          // CREATE-address predictions must match the nonce the fork's state
          // was seeded with. Deliberately frozen (in-fork txs don't show up) —
          // callers layer their own offset for queued deployments.
          return await rpcFetch(
            upstreamRpcUrl,
            method,
            [p[0], blockTag],
            signal,
          );
        default:
          return await rpcFetch(upstreamRpcUrl, method, p, signal);
      }
    },
  });

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

  return { transport, handleAction };
}

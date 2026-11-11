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
  createBatchFetcher,
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
      /** Balances the transaction changed, before and after, as hex. */
      balanceChanges?: {
        address: `0x${string}`;
        before: `0x${string}`;
        after: `0x${string}`;
      }[];
    }
  | { kind: "revert"; revertData: `0x${string}` }
  | { kind: "halt"; reason: string }
  | { kind: "misses"; misses: Miss[] }
  | { kind: "error"; message: string };

/** Backstop for a non-converging replay loop. A pass reports every cold read
 *  it reaches (see `MissDb` in the crate), so a transaction replays about
 *  once per level of state it discovers (a call made from code it had to
 *  fetch, a slot read from a slot it had to fetch), not once per read. */
const MAX_REPLAY_ITERATIONS = 512;

/** How many slots one access-list prefetch fetches at most. */
const MAX_PREFETCH_SLOTS = 5000;

/** A balance no simulated sender runs out of, for the node's access list. */
const AMPLE_BALANCE = "0xffffffffffffffffffffffffffffffff";

const slotKey = (address: string, slot: string) =>
  `${address.toLowerCase()}:${BigInt(slot).toString(16)}`;

export async function createRevmBackend(
  opts: SimBackendOpts,
): Promise<SimBackend> {
  const { upstreamRpcUrl, chainId, signal } = opts;
  const revm = await loadRevm();
  const fetchMany = createBatchFetcher(upstreamRpcUrl, signal);

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
  /** Slots fetched upstream: one asked for again means no progress. */
  const seededSlots = new Set<string>();
  /** What the run's cheats changed, for the node computing an access list
   *  to see the fork's accounts as the run left them, not as the chain has
   *  them (a Safe's delegatecall runs on code put there for it). */
  const cheats = new Map<
    string,
    { code?: string; balance?: string; stateDiff?: Record<string, string> }
  >();
  const cheat = (address: string) => {
    const key = address.toLowerCase();
    let entry = cheats.get(key);
    if (!entry) cheats.set(key, (entry = {}));
    return entry;
  };

  function assertOk(env: Envelope): void {
    if (env.kind === "error") throw new ErrorException(env.message);
  }

  /** Fetch accounts and slots from upstream in batches and insert them:
   *  accounts first, since a slot is inserted on its account. */
  async function seed(
    accounts: readonly `0x${string}`[],
    slots: readonly { address: `0x${string}`; slot: `0x${string}` }[],
  ): Promise<void> {
    const results = await fetchMany([
      ...accounts.flatMap((address) => [
        { method: "eth_getBalance", params: [address, blockTag] },
        { method: "eth_getTransactionCount", params: [address, blockTag] },
        { method: "eth_getCode", params: [address, blockTag] },
      ]),
      ...slots.map(({ address, slot }) => ({
        method: "eth_getStorageAt",
        params: [address, slot, blockTag],
      })),
    ]);
    accounts.forEach((address, i) => {
      const [balance, nonce, code] = results.slice(i * 3, i * 3 + 3);
      assertOk(
        JSON.parse(fork.insertAccount(address, balance, BigInt(nonce), code)),
      );
      seededAccounts.add(address.toLowerCase());
    });
    slots.forEach(({ address, slot }, i) => {
      assertOk(
        JSON.parse(
          fork.insertStorage(address, slot, results[accounts.length * 3 + i]),
        ),
      );
      seededSlots.add(slotKey(address, slot));
    });
  }

  async function fetchAndInsertAccount(address: `0x${string}`): Promise<void> {
    if (seededAccounts.has(address.toLowerCase())) {
      throw new ErrorException(
        `revm replay loop made no progress on account ${address}`,
      );
    }
    await seed([address], []);
  }

  async function resolveMiss(miss: Miss): Promise<void> {
    switch (miss.type) {
      case "account":
        await fetchAndInsertAccount(miss.address);
        return;
      case "storage": {
        if (seededSlots.has(slotKey(miss.address, miss.slot))) {
          throw new ErrorException(
            `revm replay loop made no progress on slot ${miss.slot} of ${miss.address}`,
          );
        }
        await seed([], [miss]);
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

  /**
   * Run until nothing is cold: each pass reports what it missed, which is
   * fetched, and the pass runs again. For a transaction (`listed`), the
   * first pass that misses also asks the node for everything the
   * transaction reads; the list joins the fetch of whichever pass comes
   * after it arrives, so a transaction deep in cold state replays a few
   * times instead of once per level it discovers. A transaction that misses
   * nothing never asks, and a list that comes too late is dropped: once
   * the transaction has run, the cache holds its writes.
   */
  async function execWithReplay(
    run: () => string,
    listed?: Record<string, unknown>,
  ): Promise<Envelope> {
    let asked = false;
    let arrived: ListEntry[] | undefined;
    for (let i = 0; i < MAX_REPLAY_ITERATIONS; i++) {
      if (signal?.aborted) throw new ErrorException("Execution cancelled");
      const env: Envelope = JSON.parse(run());
      if (env.kind !== "misses") {
        assertOk(env);
        return env;
      }
      if (listed && !asked) {
        asked = true;
        void askAccessList(listed).then((list) => {
          arrived = list;
        });
      }
      // A pass's accounts and slots are fetched together, in batches;
      // anything else (a block hash) on its own.
      const accounts: `0x${string}`[] = [];
      const slots: { address: `0x${string}`; slot: `0x${string}` }[] = [];
      const other: Miss[] = [];
      for (const miss of env.misses) {
        if (miss.type === "account") {
          if (seededAccounts.has(miss.address.toLowerCase()))
            throw new ErrorException(
              `revm replay loop made no progress on account ${miss.address}`,
            );
          accounts.push(miss.address);
        } else if (miss.type === "storage") {
          if (seededSlots.has(slotKey(miss.address, miss.slot)))
            throw new ErrorException(
              `revm replay loop made no progress on slot ${miss.slot} of ${miss.address}`,
            );
          slots.push(miss);
        } else other.push(miss);
      }
      if (arrived) {
        const extra = missingFrom(arrived);
        arrived = [];
        const have = new Set(accounts.map((a) => a.toLowerCase()));
        const haveSlots = new Set(slots.map((m) => slotKey(m.address, m.slot)));
        for (const a of extra.accounts) if (!have.has(a)) accounts.push(a);
        for (const m of extra.slots)
          if (!haveSlots.has(slotKey(m.address, m.slot))) slots.push(m);
      }
      await Promise.all([seed(accounts, slots), ...other.map(resolveMiss)]);
    }
    throw new ErrorException(
      `revm replay loop exceeded ${MAX_REPLAY_ITERATIONS} iterations`,
    );
  }

  /** Seed from/to up front: one batch instead of serial cold misses. */
  async function prefetchAccounts(
    addresses: (`0x${string}` | undefined)[],
  ): Promise<void> {
    await seed(
      [
        ...new Set(
          addresses
            .filter((a): a is `0x${string}` => !!a)
            .map((a) => a.toLowerCase() as `0x${string}`),
        ),
      ].filter((a) => !seededAccounts.has(a)),
      [],
    );
  }

  /** Whether a slot is in the fork's cache: one that is, upstream must not
   *  overwrite (the run may have written it). */
  const cached = (address: string, slot: string) =>
    (JSON.parse(fork.getStorage(address, slot)) as Envelope).kind !== "misses";

  // How the node answers eth_createAccessList: with the cheats as state
  // overrides, without them (a node that refuses overrides), or not at all.
  let accessList: "overrides" | "plain" | "none" = "overrides";

  type ListEntry = { address: `0x${string}`; storageKeys: `0x${string}`[] };

  /**
   * What the node says a transaction reads (eth_createAccessList): the
   * accounts and slots it touches, on the chain's state with the run's
   * cheats as overrides. Never throws: a node that refuses the overrides
   * is asked without them, one without the method is not asked again, and
   * anything else is no list.
   */
  async function askAccessList(
    call: Record<string, unknown>,
  ): Promise<ListEntry[]> {
    if (accessList === "none") return [];
    const overrides: Record<string, object> = {};
    for (const [address, c] of cheats) overrides[address] = { ...c };
    const from = String(call.from).toLowerCase();
    overrides[from] = { ...overrides[from], balance: AMPLE_BALANCE };
    try {
      const result = await rpcFetch(
        upstreamRpcUrl,
        "eth_createAccessList",
        accessList === "overrides"
          ? [call, blockTag, overrides]
          : [call, blockTag],
        signal,
      );
      return Array.isArray(result?.accessList) ? result.accessList : [];
    } catch (err) {
      if (signal?.aborted) return [];
      const message = err instanceof Error ? err.message : String(err);
      if (
        accessList === "overrides" &&
        /invalid (params|argument)|-32602/i.test(message)
      ) {
        accessList = "plain";
        return askAccessList(call);
      }
      if (
        /not (whitelisted|supported|found|available)|does not exist|-32601/i.test(
          message,
        )
      )
        accessList = "none";
      return [];
    }
  }

  /** What of a list is not in the fork yet: its accounts never seeded, its
   *  slots neither fetched nor cached. A cached slot may be the run's own
   *  write, which upstream must not overwrite. Asked between passes, when
   *  the cache holds no write of the transaction being run. */
  function missingFrom(list: readonly ListEntry[]): {
    accounts: `0x${string}`[];
    slots: { address: `0x${string}`; slot: `0x${string}` }[];
  } {
    const accounts = new Set<`0x${string}`>();
    const slots: { address: `0x${string}`; slot: `0x${string}` }[] = [];
    for (const { address, storageKeys } of list) {
      const a = address.toLowerCase() as `0x${string}`;
      if (!seededAccounts.has(a)) accounts.add(a);
      for (const slot of storageKeys ?? []) {
        if (slots.length >= MAX_PREFETCH_SLOTS) break;
        if (seededSlots.has(slotKey(a, slot))) continue;
        if (seededAccounts.has(a) && cached(a, slot)) continue;
        slots.push({ address: a, slot });
      }
    }
    return { accounts: [...accounts], slots };
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
      cheat(addr).balance = balance;
      return;
    }
    if (method.endsWith("_setCode")) {
      const [addr, code] = params as [`0x${string}`, `0x${string}`];
      await execWithReplay(() => fork.setCode(addr, code));
      seededAccounts.add(addr.toLowerCase());
      cheat(addr).code = code;
      return;
    }
    if (method.endsWith("_setStorageAt")) {
      const [addr, slot, value] = params as `0x${string}`[];
      await execWithReplay(() => fork.setStorage(addr, slot, value));
      const entry = cheat(addr);
      entry.stateDiff = {
        ...entry.stateDiff,
        [numberToHex(BigInt(slot), { size: 32 })]: numberToHex(BigInt(value), {
          size: 32,
        }),
      };
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

    const env = await execWithReplay(() => fork.transact(tx), {
      from,
      ...(action.to ? { to: action.to } : {}),
      ...(action.data ? { data: action.data } : {}),
      ...(action.value ? { value: numberToHex(action.value) } : {}),
    });
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
      gasUsed: BigInt(env.gasUsed),
      logs: env.logs.map((log, logIndex) => ({ ...log, logIndex })),
      balanceChanges: (env.balanceChanges ?? []).map((c) => ({
        address: c.address,
        before: BigInt(c.before),
        after: BigInt(c.after),
      })),
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

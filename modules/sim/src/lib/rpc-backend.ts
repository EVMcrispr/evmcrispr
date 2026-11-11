import {
  type Action,
  describeRevertData,
  ErrorException,
  isRpcAction,
  isTransactionAction,
  RevertError,
} from "@evmcrispr/sdk";
import {
  type Address,
  custom,
  getAddress,
  type Hex,
  hexToBigInt,
  numberToHex,
  pad,
  toEventSelector,
} from "viem";
import {
  type BalanceChange,
  createBatchFetcher,
  fetchBlockTimestamp,
  resolveLatestBlockNumber,
  rpcFetch,
  type SimBackend,
  type SimBackendOpts,
  type SyntheticReceipt,
  syntheticTxHash,
} from "./backend";

/**
 * The `rpc` engine: the chain's own node runs the simulation, through
 * `eth_simulateV1`. Nothing is fetched or executed here. The node keeps no
 * session, so the run's history (its simulated blocks: overrides, then
 * calls) is sent again with every transaction and every read, on top of the
 * pinned block, and grows with the run.
 *
 * - A transaction is the history plus itself; when it succeeds it joins the
 *   history.
 * - The cheats are state overrides (balance, code, storage slots), which a
 *   node applies at the start of a block: one that comes after calls opens a
 *   new block. A time warp or `mine` opens one too, later in time.
 * - A read is the history plus the read. A balance, code or slot has no
 *   call of its own, so one more block places a reader by override: a
 *   contract asking BALANCE or EXTCODECOPY, or the account's own code
 *   swapped for an SLOAD (an override of code keeps the storage).
 */

/** Geth refuses a request with more simulated blocks than this. */
const MAX_BLOCKS = 256;

/** A whole run is one request the node executes: it may take a while. */
const SIMULATE_TIMEOUT_MS = 180_000;

/** Where the readers are placed: an address nothing on a chain uses. */
const READER: Address = "0x00000000000000000000000000000000005e7ea0";

// BALANCE(calldataload(0)), returned as a word.
const BALANCE_READER: Hex = "0x6000353160005260206000f3";
// EXTCODECOPY(calldataload(0), 0, 0, size), returned whole.
const CODE_READER: Hex = "0x600035803b8060006000843c6000f3";
// SLOAD(calldataload(0)) of the account it stands in for, as a word.
const SLOT_READER: Hex = "0x6000355460005260206000f3";
/** Where the code reader goes when a batch reads balances too: one block
 *  places both. */
const CODE_READER_AT: Address = "0x00000000000000000000000000000000005e7ea1";

/** The most reads one request carries. */
const MAX_BATCH = 64;

/** How many times a simulation is asked for before its failure stands. A
 *  node behind a load balancer can fail a request another one answers:
 *  measured 2026-11-12 on dRPC's Gnosis pool, 3 of 40 identical requests
 *  failed with a Nethermind internal error, the rest passed. A simulation
 *  changes nothing, so asking again is safe. */
const SIMULATE_ATTEMPTS = 3;

/** The account `traceTransfers` reports native transfers from, as logs. */
const TRANSFERS: Address = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
/** Where a chain with EIP-7708 live (Sepolia since Amsterdam) logs native
 *  transfers itself: a node reports those instead of `TRANSFERS`. */
const EIP7708_TRANSFERS: Address = getAddress(
  "0xfffffffffffffffffffffffffffffffffffffffe",
);
const TRANSFER_TOPIC = toEventSelector(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

interface Override {
  balance?: Hex;
  nonce?: Hex;
  code?: Hex;
  stateDiff?: Record<Hex, Hex>;
}

interface Call {
  from?: Address;
  to?: Address;
  data?: Hex;
  value?: Hex;
  gas?: Hex;
}

interface SimBlock {
  number: bigint;
  time: bigint;
  overrides: Record<Address, Override>;
  calls: Call[];
}

interface CallResult {
  status: Hex;
  returnData: Hex;
  gasUsed: Hex;
  logs: { address: Address; topics: Hex[]; data: Hex }[];
  error?: { code: number; message: string; data?: Hex };
}

export async function createRpcBackend(
  opts: SimBackendOpts,
): Promise<SimBackend> {
  const { upstreamRpcUrl, chainId, signal } = opts;
  const baseBlockNumber = opts.blockNumber
    ? BigInt(opts.blockNumber)
    : await resolveLatestBlockNumber(upstreamRpcUrl, signal);
  const baseTimestamp = await fetchBlockTimestamp(
    upstreamRpcUrl,
    baseBlockNumber,
    signal,
  );
  const blockTag = numberToHex(baseBlockNumber);

  // Mirrors the in-process engines: blocks advance only when mined, time
  // only when warped. Blocks opened for overrides step by one each, as the
  // node requires them to increase.
  let mined = 0n;
  let warped = 0n;
  const history: SimBlock[] = [];

  const openBlock = (): SimBlock => {
    const last = history.at(-1);
    const number = baseBlockNumber + 1n + mined;
    const time = baseTimestamp + 12n + warped;
    const block: SimBlock = {
      number: last && last.number >= number ? last.number + 1n : number,
      time: last && last.time >= time ? last.time + 1n : time,
      overrides: {},
      calls: [],
    };
    history.push(block);
    return block;
  };
  /** The block a call joins: the last one, unless time moved since. */
  let fresh = true;
  const callBlock = (): SimBlock => {
    if (fresh || history.length === 0) {
      fresh = false;
      return openBlock();
    }
    return history.at(-1)!;
  };
  /** The block an override joins: a new one once the last has calls. */
  const overrideBlock = (): SimBlock => {
    const last = history.at(-1);
    if (!fresh && last && last.calls.length === 0) return last;
    fresh = false;
    return openBlock();
  };

  const encode = (block: SimBlock) => ({
    blockOverrides: {
      number: numberToHex(block.number),
      time: numberToHex(block.time),
    },
    ...(Object.keys(block.overrides).length > 0
      ? { stateOverrides: block.overrides }
      : {}),
    calls: block.calls,
  });

  /** Simulate `blocks` on the pinned block; the results of each. */
  /** eth_simulateV1's parameters for `blocks` on the pinned block. */
  function simulateParams(blocks: SimBlock[]): unknown[] {
    if (blocks.length > MAX_BLOCKS) {
      throw new ErrorException(
        `the rpc engine can send at most ${MAX_BLOCKS} simulated blocks; this run needs ${blocks.length} (each time warp, mine, or cheat after a transaction opens one)`,
      );
    }
    return [
      {
        blockStateCalls: blocks.map(encode),
        traceTransfers: true,
        validation: false,
      },
      blockTag,
    ];
  }

  async function simulate(
    blocks: SimBlock[],
  ): Promise<{ calls: CallResult[] }[]> {
    const params = simulateParams(blocks);
    for (let attempt = 1; ; attempt++) {
      try {
        return await rpcFetch(
          upstreamRpcUrl,
          "eth_simulateV1",
          params,
          signal,
          SIMULATE_TIMEOUT_MS,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          /code -32601\)|method not found|does not exist|not supported/i.test(
            message,
          )
        ) {
          throw new ErrorException(
            `the RPC for chain ${chainId} does not offer eth_simulateV1, which the rpc engine runs on: use an RPC that does, or the ethereumjs or revm engine`,
          );
        }
        // A node's refusal, or a pool's 5xx/429, may pass on another node.
        // A timeout already waited the longest a simulation may take, and a
        // cancelled run is over.
        const retryable =
          /upstream RPC rejected|upstream RPC returned HTTP (5\d\d|429)/.test(
            message,
          );
        if (!retryable || signal?.aborted || attempt >= SIMULATE_ATTEMPTS)
          throw err;
      }
    }
  }

  /** The history with `extras` appended as blocks of their own, which are
   *  not kept. They come after a time warp or a mine since the last block,
   *  as a transaction would: a read after `wait` sees the later time. */
  const afterHistory = (
    extras: Omit<SimBlock, "number" | "time">[],
  ): SimBlock[] => {
    const blocks = [...history];
    for (const extra of extras) {
      const last = blocks.at(-1);
      const number = baseBlockNumber + 1n + mined;
      const time = baseTimestamp + 12n + warped;
      blocks.push({
        number: last && last.number >= number ? last.number + 1n : number,
        time: last && last.time >= time ? last.time + 1n : time,
        ...extra,
      });
    }
    return blocks;
  };

  /** Run calls placed in a block of their own after the history. */
  async function readBlock(
    overrides: Record<Address, Override>,
    calls: Call[],
  ): Promise<CallResult[]> {
    const results = await simulate(afterHistory([{ overrides, calls }]));
    return results.at(-1)!.calls;
  }

  async function balanceOf(addresses: Address[]): Promise<bigint[]> {
    if (addresses.length === 0) return [];
    const results = await readBlock(
      { [READER]: { code: BALANCE_READER } },
      addresses.map((a) => ({ to: READER, data: pad(a) })),
    );
    return results.map((r) => hexToBigInt(r.returnData));
  }

  /** A failed call as the in-process engines report it: the decoded
   *  reason, else `fallback` (the node's own words describe its tracer, not
   *  the contract). */
  function failure(result: CallResult, fallback: string): RevertError {
    const data = result.error?.data ?? result.returnData;
    const reason = data && data !== "0x" ? describeRevertData(data) : undefined;
    return new RevertError(
      reason ?? fallback,
      data && data !== "0x" ? data : undefined,
    );
  }

  const toCall = (action: {
    from?: string;
    to?: string;
    data?: string;
    value?: bigint;
    gas?: bigint;
  }): Call => ({
    ...(action.from ? { from: getAddress(action.from) } : {}),
    ...(action.to ? { to: getAddress(action.to) } : {}),
    ...(action.data ? { data: action.data as Hex } : {}),
    ...(action.value ? { value: numberToHex(action.value) } : {}),
    ...(action.gas !== undefined ? { gas: numberToHex(action.gas) } : {}),
  });

  // Native balances at the end of the history, as far as they are known:
  // read once, then followed through every transaction's transfers, so a
  // transaction needs no read before it (a value's top-up) or after it
  // (its balance changes) for an account seen before. With validation off
  // no fee is charged, so only transfers and overrides move a balance.
  const known = new Map<Address, bigint>();

  // ── reads ──

  async function handleEthCall(params: any[]): Promise<Hex> {
    const call = toCall({
      ...params[0],
      value: params[0]?.value ? BigInt(params[0].value) : undefined,
      gas: params[0]?.gas ? BigInt(params[0].gas) : undefined,
    });
    const results = await readBlock({}, [call]);
    const result = results[0];
    if (result.status !== "0x1") throw failure(result, "execution reverted");
    return result.returnData;
  }

  // Every read re-runs the history on the node, and a run asks the same
  // things again (a suggestion's views, a helper's reads): while the
  // history is the same, so is the answer. Anything that changes the
  // history moves `version` on.
  let version = 0;
  const answers = new Map<string, Promise<unknown>>();
  const MEMO = new Set([
    "eth_call",
    "eth_getBalance",
    "eth_getCode",
    "eth_getStorageAt",
  ]);

  const transport = custom({
    async request({ method, params }: { method: string; params?: any[] }) {
      if (!MEMO.has(method)) return read(method, params ?? []);
      const key = `${version}|${method}|${JSON.stringify(params ?? [])}`;
      let answer = answers.get(key);
      if (!answer) {
        answer = enqueue(method, params ?? []);
        answers.set(key, answer);
        // A failed request (a timeout) is not an answer to keep; a revert
        // is, and comes back the same.
        answer.catch((err) => {
          if (!(err instanceof RevertError)) answers.delete(key);
        });
      }
      return answer;
    },
  });

  async function read(method: string, p: any[]): Promise<unknown> {
    switch (method) {
      case "eth_call":
        return await handleEthCall(p);
      case "eth_getBalance": {
        const at = version;
        const [value] = await balanceOf([getAddress(p[0])]);
        learn(p[0], value, at);
        return numberToHex(value);
      }
      case "eth_getCode": {
        const [result] = await readBlock({ [READER]: { code: CODE_READER } }, [
          { to: READER, data: pad(getAddress(p[0])) },
        ]);
        return result.returnData;
      }
      case "eth_getStorageAt": {
        const address = getAddress(p[0]);
        const [result] = await readBlock({ [address]: { code: SLOT_READER } }, [
          { to: address, data: pad(p[1] as Hex) },
        ]);
        return pad(result.returnData === "0x" ? "0x0" : result.returnData);
      }
      case "eth_blockNumber": {
        const last = history.at(-1)?.number ?? 0n;
        const now = baseBlockNumber + mined;
        return numberToHex(last > now ? last : now);
      }
      case "eth_chainId":
        return numberToHex(chainId);
      case "eth_getTransactionCount":
        // At the pinned block, as the in-process engines answer it.
        return await rpcFetch(upstreamRpcUrl, method, [p[0], blockTag], signal);
      default:
        return await rpcFetch(upstreamRpcUrl, method, p, signal);
    }
  }

  // Reads asked in the same tick (a run's suggestions ask theirs at once)
  // go to the node together, in one JSON-RPC batch. Each eth_call is a
  // simulation of its own, the history and then the call, so no call sees
  // what another wrote: calls in one block share state, and a contract
  // being simulated could write from a "view" to change what a later read
  // returns. Balances, code and slots are read by the engine's own
  // readers, which write nothing, and share one simulation. A simulation
  // the batch did not answer is asked again alone, with its retries.
  const simulationOf = new WeakMap<object, SimBlock[]>();
  const fetchSimulations = createBatchFetcher(upstreamRpcUrl, signal, {
    // Each simulation carries the history: fewer per batch than reads.
    size: 20,
    timeoutMs: SIMULATE_TIMEOUT_MS,
    single: (call) =>
      simulate(simulationOf.get(call)!).catch((error) => ({ failed: error })),
  });
  type Pending = {
    method: string;
    params: any[];
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  };
  let queue: Pending[] = [];
  let scheduled = false;

  function enqueue(method: string, params: any[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      queue.push({ method, params, resolve, reject });
      if (!scheduled) {
        scheduled = true;
        setTimeout(flush, 0);
      }
    });
  }

  function flush(): void {
    scheduled = false;
    const pending = queue;
    queue = [];
    for (let i = 0; i < pending.length; i += MAX_BATCH)
      void readBatch(pending.slice(i, i + MAX_BATCH));
  }

  const one = (p: Pending) =>
    read(p.method, p.params).then(p.resolve, p.reject);

  /** A balance read of the history's end is a balance known from then. */
  const learn = (address: string, value: bigint, at: number) => {
    if (version === at) known.set(getAddress(address), value);
  };

  async function readBatch(batch: Pending[]): Promise<void> {
    if (batch.length === 1) return one(batch[0]);
    const at = version;
    const calls: { p: Pending; call: Call }[] = [];
    // Balances and code first; storage after, since a slot is read by
    // swapping its account's code.
    const reads: { p: Pending; call: Call }[] = [];
    const slots: { p: Pending; call: Call }[] = [];
    const slotOverrides: Record<Address, Override> = {};
    for (const p of batch) {
      switch (p.method) {
        case "eth_call":
          calls.push({
            p,
            call: toCall({
              ...p.params[0],
              value: p.params[0]?.value ? BigInt(p.params[0].value) : undefined,
              gas: p.params[0]?.gas ? BigInt(p.params[0].gas) : undefined,
            }),
          });
          break;
        case "eth_getBalance":
          reads.push({
            p,
            call: { to: READER, data: pad(getAddress(p.params[0])) },
          });
          break;
        case "eth_getCode":
          reads.push({
            p,
            call: { to: CODE_READER_AT, data: pad(getAddress(p.params[0])) },
          });
          break;
        case "eth_getStorageAt": {
          const address = getAddress(p.params[0]);
          slotOverrides[address] = { code: SLOT_READER };
          slots.push({
            p,
            call: { to: address, data: pad(p.params[1] as Hex) },
          });
          break;
        }
        default:
          void one(p);
      }
    }

    const answer = ({ p }: { p: Pending }, result: CallResult): void => {
      switch (p.method) {
        case "eth_call":
          if (result.status !== "0x1")
            p.reject(failure(result, "execution reverted"));
          else p.resolve(result.returnData);
          return;
        case "eth_getBalance": {
          const value = hexToBigInt(result.returnData);
          learn(p.params[0], value, at);
          p.resolve(numberToHex(value));
          return;
        }
        case "eth_getCode":
          p.resolve(result.returnData);
          return;
        default:
          p.resolve(
            pad(result.returnData === "0x" ? "0x0" : result.returnData),
          );
      }
    };

    // The simulations to ask, each with what it answers. Where the reads
    // sit is fixed now: a cheat while the batch is in flight adds to the
    // history, not to what was sent.
    const simulations: {
      blocks: SimBlock[];
      pending: Pending[];
      finish: (results: { calls: CallResult[] }[]) => void;
    }[] = [];
    if (reads.length > 0 || slots.length > 0) {
      const extras: Omit<SimBlock, "number" | "time">[] = [];
      if (reads.length > 0)
        extras.push({
          overrides: {
            [READER]: { code: BALANCE_READER },
            [CODE_READER_AT]: { code: CODE_READER },
          },
          calls: reads.map((r) => r.call),
        });
      if (slots.length > 0)
        extras.push({
          overrides: slotOverrides,
          calls: slots.map((r) => r.call),
        });
      const blocks = afterHistory(extras);
      const index = blocks.length - extras.length;
      simulations.push({
        blocks,
        pending: [...reads, ...slots].map((r) => r.p),
        finish: (results) => {
          reads.forEach((r, i) => answer(r, results[index].calls[i]));
          slots.forEach((r, i) =>
            answer(r, results[index + (reads.length > 0 ? 1 : 0)].calls[i]),
          );
        },
      });
    }
    for (const c of calls)
      simulations.push({
        blocks: afterHistory([{ overrides: {}, calls: [c.call] }]),
        pending: [c.p],
        finish: (results) => answer(c, results.at(-1)!.calls[0]),
      });

    const requests: { method: string; params: unknown[] }[] = [];
    const asked: typeof simulations = [];
    for (const sim of simulations) {
      let params: unknown[];
      try {
        params = simulateParams(sim.blocks);
      } catch (err) {
        for (const p of sim.pending) p.reject(err);
        continue;
      }
      const request = { method: "eth_simulateV1", params };
      simulationOf.set(request, sim.blocks);
      requests.push(request);
      asked.push(sim);
    }
    let results: any[];
    try {
      results = await fetchSimulations(requests);
    } catch (err) {
      for (const sim of asked) for (const p of sim.pending) p.reject(err);
      return;
    }
    asked.forEach((sim, i) => {
      const result = results[i];
      if (result && typeof result === "object" && "failed" in result) {
        for (const p of sim.pending) p.reject(result.failed);
        return;
      }
      try {
        sim.finish(result);
      } catch (err) {
        for (const p of sim.pending) p.reject(err);
      }
    });
  }

  /** The history changed: no answer read before holds. */
  const changed = () => {
    version++;
    answers.clear();
  };

  // ── writes ──

  async function handleRpcAction(
    method: string,
    params: unknown[],
  ): Promise<void> {
    changed();
    if (method === "evm_increaseTime") {
      warped += BigInt(params[0] as string);
      fresh = true;
      return;
    }
    if (method.endsWith("_mine") || method === "evm_increaseBlocks") {
      mined += BigInt((params[0] as string | undefined) ?? "0x1");
      fresh = true;
      return;
    }
    if (method.endsWith("_setBalance")) {
      const [address, balance] = params as [Address, Hex];
      const block = overrideBlock();
      const at = getAddress(address);
      block.overrides[at] = {
        ...block.overrides[at],
        balance: numberToHex(BigInt(balance)),
      };
      known.set(at, BigInt(balance));
      return;
    }
    if (method.endsWith("_setCode")) {
      const [address, code] = params as [Address, Hex];
      const block = overrideBlock();
      const at = getAddress(address);
      block.overrides[at] = { ...block.overrides[at], code };
      return;
    }
    if (method.endsWith("_setStorageAt")) {
      const [address, slot, value] = params as [Address, Hex, Hex];
      const block = overrideBlock();
      const at = getAddress(address);
      block.overrides[at] = {
        ...block.overrides[at],
        stateDiff: {
          ...block.overrides[at]?.stateDiff,
          [pad(slot)]: pad(value),
        },
      };
      return;
    }
    throw new ErrorException(`Unsupported RPC method in rpc mode: ${method}`);
  }

  let txCounter = 0;

  async function handleTransactionAction(
    action: Action,
  ): Promise<SyntheticReceipt | undefined> {
    if (!isTransactionAction(action)) return undefined;
    const call = toCall({
      from: action.from ?? `0x${"0".repeat(40)}`,
      to: action.to,
      data: action.data,
      value: action.value,
      gas: action.gas,
    });
    // An explicit nonce (--nonce) is what a CREATE address is derived
    // from: the node takes it from the sender's state, so it is set there.
    if (action.nonce !== undefined) {
      const sender = getAddress(call.from!);
      const at = overrideBlock();
      at.overrides[sender] = {
        ...at.overrides[sender],
        nonce: numberToHex(action.nonce),
      };
    }
    // Like the in-process engines (EthereumJS's skipBalance), a sender
    // short of the value it sends is topped up to it: what a run shows is
    // where the value goes, not whether the account was funded first.
    if (action.value) {
      const sender = getAddress(call.from!);
      const balance = known.get(sender) ?? (await balanceOf([sender]))[0];
      known.set(sender, balance);
      if (balance < action.value) {
        const at = overrideBlock();
        at.overrides[sender] = {
          ...at.overrides[sender],
          balance: numberToHex(action.value),
        };
        known.set(sender, action.value);
      }
    }
    const block = callBlock();
    block.calls.push(call);
    // The sender's and recipient's balances after it, read in the same
    // request when not known yet: the accounts a transfer moves most.
    const ends = [
      ...new Set(
        [call.from, call.to]
          .filter((a): a is Address => !!a)
          .map((a) => getAddress(a))
          .filter((a) => !known.has(a)),
      ),
    ];
    const request: SimBlock[] =
      ends.length === 0
        ? history
        : [
            ...history.slice(0, -1),
            {
              ...block,
              overrides: {
                ...block.overrides,
                [READER]: { code: BALANCE_READER },
              },
              calls: [
                ...block.calls,
                ...ends.map((a) => ({ to: READER, data: pad(a) })),
              ],
            },
          ];
    let results: { calls: CallResult[] }[];
    try {
      results = await simulate(request);
    } catch (err) {
      block.calls.pop();
      throw err;
    }
    const lastCalls = results.at(-1)!.calls;
    const result = lastCalls[block.calls.length - 1];
    // A read that did not answer a word is left unknown, to be read alone.
    const endBalances = new Map<Address, bigint>();
    ends.forEach((a, i) => {
      const read = lastCalls[block.calls.length + i];
      if (read?.status === "0x1" && read.returnData.length === 66)
        endBalances.set(a, hexToBigInt(read.returnData));
    });
    // Whether it joins the history or not, overrides it opened may have.
    changed();
    if (result.status !== "0x1") {
      // A failed transaction changes nothing a run looks at again.
      block.calls.pop();
      throw failure(result, "Transaction reverted");
    }

    // Native transfers, from traceTransfers' logs, else from the chain's own
    // EIP-7708 logs: a node that reported both ways would count each twice.
    const transfersFrom = (emitter: Address) =>
      result.logs.filter(
        (l) =>
          getAddress(l.address) === emitter && l.topics[0] === TRANSFER_TOPIC,
      );
    const traced = transfersFrom(TRANSFERS);
    const transfers =
      traced.length > 0 ? traced : transfersFrom(EIP7708_TRANSFERS);
    // Value sent with no transfer reported: this node does not trace them,
    // so balances can no longer be followed from its logs.
    if (action.value && transfers.length === 0) known.clear();
    // traceTransfers' logs are the tracer's; EIP-7708's are the chain's own
    // and stay in the receipt, as a node mines them.
    const logs = result.logs
      .filter((l) => getAddress(l.address) !== TRANSFERS)
      .map((log, logIndex) => ({ ...log, logIndex }));

    return {
      status: "success",
      blockNumber: block.number,
      transactionHash: syntheticTxHash(action, txCounter++),
      gasUsed: hexToBigInt(result.gasUsed),
      logs,
      balanceChanges: await balanceChanges(transfers, endBalances),
    };
  }

  /** Native balance changes, from the transaction's transfer logs and the
   *  balances known or read with it; an account neither is read after it,
   *  and its balance before is that less what it gained. */
  async function balanceChanges(
    transfers: CallResult["logs"],
    read: Map<Address, bigint>,
  ): Promise<BalanceChange[]> {
    const net = new Map<Address, bigint>();
    for (const log of transfers) {
      const from = getAddress(`0x${log.topics[1].slice(-40)}`);
      const to = getAddress(`0x${log.topics[2].slice(-40)}`);
      const value = hexToBigInt(log.data);
      net.set(from, (net.get(from) ?? 0n) - value);
      net.set(to, (net.get(to) ?? 0n) + value);
    }
    const moved = [...net].filter(([, delta]) => delta !== 0n);
    const unknown = moved
      .map(([a]) => a)
      .filter((a) => !known.has(a) && !read.has(a));
    // The transaction has joined the history: these are balances after it.
    const after = await balanceOf(unknown);
    unknown.forEach((a, i) => read.set(a, after[i]));
    const changes = moved.map(([address, delta]) => {
      const before = known.get(address);
      return before !== undefined
        ? { address, before, after: before + delta }
        : {
            address,
            before: read.get(address)! - delta,
            after: read.get(address)!,
          };
    });
    for (const [a, value] of read) if (!net.has(a)) known.set(a, value);
    for (const c of changes) known.set(c.address, c.after);
    return changes;
  }

  async function handleAction(
    action: Action,
  ): Promise<SyntheticReceipt | undefined> {
    if (isRpcAction(action)) {
      await handleRpcAction(action.method, action.params);
      return undefined;
    }
    if (isTransactionAction(action)) return handleTransactionAction(action);
    return undefined;
  }

  return { transport, handleAction };
}

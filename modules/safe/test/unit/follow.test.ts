import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { ActionOutcome, BoxHandle } from "@evmcrispr/sdk";
import { encodeAbiParameters, type Hex, keccak256, toHex } from "viem";
import type Safe from "../../src";
import { followProposal } from "../../src/utils/follow";

const SAFE = "0x1111111111111111111111111111111111111111" as const;
const HASH = `0x${"ab".repeat(32)}` as Hex;
const OTHER = `0x${"cd".repeat(32)}` as Hex;
const SUCCESS = keccak256(toHex("ExecutionSuccess(bytes32,uint256)"));
const FAILURE = keccak256(toHex("ExecutionFailure(bytes32,uint256)"));
const EXEC_TX = `0x${"ee".repeat(32)}` as Hex;

interface FakeLog {
  topics: Hex[];
  data: Hex;
  blockNumber: bigint;
  transactionHash: Hex;
}

/** An L1-style Safe < 1.4.1 event: the hash sits in data, not topics. */
const log = (topic: Hex, hash: Hex, blockNumber: bigint): FakeLog => ({
  topics: [topic],
  data: encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }],
    [hash, 0n],
  ),
  blockNumber,
  transactionHash: EXEC_TX,
});

let chain: {
  head: bigint;
  /** Block at which the Safe's nonce moved past the proposal's. */
  usedAt: bigint;
  logs: FakeLog[];
  /** Logs of blocks at or above this are not indexed yet. */
  indexedBelow: bigint;
  maxRange: bigint;
  getLogsCalls: number;
  receipts: Map<string, { logs: FakeLog[] }>;
};
let service: { isExecuted: boolean; transactionHash: Hex | null };
let fetchSpy: ReturnType<typeof spyOn>;

const client = {
  getBlockNumber: async () => chain.head,
  readContract: async ({ blockNumber }: { blockNumber: bigint }) =>
    blockNumber >= chain.usedAt ? 6n : 5n,
  getLogs: async ({
    fromBlock,
    toBlock,
  }: {
    fromBlock: bigint;
    toBlock: bigint;
  }) => {
    chain.getLogsCalls++;
    if (toBlock - fromBlock + 1n > chain.maxRange)
      throw new Error("block range too large");
    return chain.logs.filter(
      (l) =>
        l.blockNumber >= fromBlock &&
        l.blockNumber <= toBlock &&
        l.blockNumber < chain.indexedBelow,
    );
  },
  getTransactionReceipt: async ({ hash }: { hash: Hex }) => {
    const receipt = chain.receipts.get(hash);
    if (!receipt) throw new Error("receipt not found");
    return receipt;
  },
};

const module = {
  getClient: async () => client,
  getConfigBinding: (key: string) =>
    key === "serviceUrl" ? "http://service.test" : undefined,
} as unknown as Safe;

const makeBox = () => {
  const controller = new AbortController();
  const ended: {
    state?: "done" | "failed" | "cancelled";
    detail?: string;
    links: Record<string, string>;
  } = { links: {} };
  const box: BoxHandle = {
    id: "box",
    signal: controller.signal,
    simulated: false,
    update: (u) => {
      Object.assign(ended.links, u.links);
    },
    done: (detail) => {
      ended.state = "done";
      ended.detail = detail;
    },
    fail: (detail) => {
      ended.state = "failed";
      ended.detail = detail;
    },
    cancel: (detail) => {
      ended.state = "cancelled";
      ended.detail = detail;
    },
    reveal: () => {},
    watch: () => {},
    poll: async (step) => {
      for (let i = 0; i < 20; i++) {
        let result: "continue" | "stop";
        try {
          result = await step();
        } catch {
          result = "continue";
        }
        if (result === "stop") return;
        // Blocks keep coming between polls, like on a live chain.
        chain.indexedBelow = chain.head + 1n;
      }
      throw new Error("follower never stopped");
    },
  };
  return { box, ended };
};

const follow = (fromBlock: bigint, chainId = 100) => {
  const { box, ended } = makeBox();
  return followProposal(module, box, {
    chainId,
    safe: SAFE,
    safeTxHash: HASH,
    nonce: 5n,
    fromBlock,
  }).then((outcome: ActionOutcome) => ({ outcome, ended }));
};

beforeEach(() => {
  chain = {
    head: 110n,
    usedAt: 105n,
    logs: [],
    indexedBelow: 1_000_000n,
    maxRange: 2_000n,
    getLogsCalls: 0,
    receipts: new Map(),
  };
  service = { isExecuted: false, transactionHash: null };
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    (async () =>
      new Response(
        JSON.stringify({
          confirmations: [],
          confirmationsRequired: 1,
          ...service,
        }),
      )) as unknown as typeof fetch,
  );
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("Safe > utils > followProposal", () => {
  it("reports an execution whose inner call failed as reverted", async () => {
    chain.logs = [log(FAILURE, HASH, 105n)];
    const { outcome, ended } = await follow(100n);
    expect(outcome.kind).toBe("reverted");
    expect(ended.state).toBe("failed");
    expect(ended.detail).toBe(
      `Executed but reverted in [${EXEC_TX.slice(0, 10)}…](https://gnosisscan.io/tx/${EXEC_TX})`,
    );
  });

  it("links the full execution hash on the chain explorer", async () => {
    chain.logs = [log(SUCCESS, HASH, 105n)];
    const { ended } = await follow(100n);
    expect(ended.state).toBe("done");
    expect(ended.detail).toBe(
      `Executed in [${EXEC_TX.slice(0, 10)}…](https://gnosisscan.io/tx/${EXEC_TX})`,
    );
    expect(ended.links.Transaction).toBe(`https://gnosisscan.io/tx/${EXEC_TX}`);
  });

  it("shows the full execution hash on a chain without an explorer", async () => {
    chain.logs = [log(SUCCESS, HASH, 105n)];
    const { ended } = await follow(100n, 987_654_321);
    expect(ended.detail).toBe(`Executed in ${EXEC_TX}`);
    expect(ended.links.Transaction).toBeUndefined();
  });

  it("does not conclude replaced while the RPC's log index lags", async () => {
    chain.logs = [log(SUCCESS, HASH, 105n)];
    // The nonce read sees block 105, getLogs does not yet.
    chain.indexedBelow = 105n;
    const { outcome, ended } = await follow(100n);
    expect(outcome).toEqual({ kind: "confirmed", receipt: EXEC_TX });
    expect(ended.state).toBe("done");
  });

  it("trusts the service's execution hash once its receipt proves it", async () => {
    service = { isExecuted: true, transactionHash: EXEC_TX };
    chain.indexedBelow = 0n; // getLogs never sees anything.
    chain.receipts.set(EXEC_TX, { logs: [log(SUCCESS, HASH, 105n)] });
    const { outcome } = await follow(100n);
    expect(outcome).toEqual({ kind: "confirmed", receipt: EXEC_TX });
  });

  it("searches a long gap in bounded windows", async () => {
    chain.head = 20_000n;
    chain.usedAt = 19_000n;
    chain.logs = [log(SUCCESS, HASH, 19_000n)];
    const { outcome } = await follow(4_000n);
    expect(outcome).toEqual({ kind: "confirmed", receipt: EXEC_TX });
  });

  it("does not search the same windows again on the next poll", async () => {
    chain.head = 20_000n;
    chain.usedAt = 19_000n;
    await follow(4_000n);
    const calls = chain.getLogsCalls;
    // Eight windows cover the gap once; later polls recheck only the last.
    expect(calls).toBeLessThan(12);
  });

  it("reports replaced when another transaction used the nonce", async () => {
    chain.logs = [log(SUCCESS, OTHER, 105n)];
    const { outcome, ended } = await follow(100n);
    expect(outcome).toEqual({
      kind: "replaced",
      reason: "Replaced by another transaction at nonce 5",
    });
    expect(ended.state).toBe("failed");
  });
});

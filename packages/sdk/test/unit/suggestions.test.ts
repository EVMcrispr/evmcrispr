import { describe, expect, it } from "bun:test";
import {
  type AbiEvent,
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Hex,
  parseAbiItem,
} from "viem";
import {
  budgetedRead,
  collectSuggestions,
  defineEvent,
  type EventImportMap,
  floorAfter,
  MAX_SUGGESTION_LOGS,
  nativeFloor,
  type RawLog,
  type SuggestEnv,
  safeSymbol,
  sameValue,
  stateCandidate,
} from "../../src";

const TOKEN = getAddress("0x00000000000000000000000000000000000a0001");
const EXEC = getAddress("0x00000000000000000000000000000000000a0002");
const OTHER = getAddress("0x00000000000000000000000000000000000a0003");
const PING = "event Ping(address indexed who, uint256 value)";

function log(
  signature: string,
  address: Address,
  args: Record<string, unknown>,
): RawLog {
  const abi = parseAbiItem(signature) as AbiEvent;
  const topics = encodeEventTopics({ abi: [abi], args } as never) as Hex[];
  const plain = abi.inputs.filter((i) => !i.indexed);
  const data = encodeAbiParameters(
    plain,
    plain.map((i) => args[i.name!]) as never,
  );
  return { address, topics, data };
}

const env = (read: SuggestEnv["read"]): SuggestEnv => ({
  chainId: 1,
  executor: EXEC,
  tolerance: 1,
  nativeSymbol: "ETH",
  read,
  formatAmount: async (_t, amount) => `${amount} units`,
  tokenName: async () => "TKN",
});

const ping = defineEvent({
  name: "ping",
  description: "test event",
  event: PING,
  suggest: async (e, { emitter, logs }) =>
    stateCandidate(
      e,
      {
        address: emitter,
        signature: "function pinged(address) view returns (uint256)",
        args: [logs.at(-1)!.who],
        expect: logs.at(-1)!.value,
      },
      `assert ${emitter}::!{pinged(address)(uint256) ${logs.at(-1)!.who}} == ${logs.at(-1)!.value}`,
      "pinged",
    ),
});
const events: EventImportMap = {
  ping: { load: async () => ({ default: ping }), event: PING },
};

describe("collectSuggestions", () => {
  it("returns a state candidate when the view confirms the event", async () => {
    const out = await collectSuggestions({
      modules: [{ name: "t", events }],
      logs: [log(PING, TOKEN, { who: OTHER, value: 7n })],
      env: env(async () => 7n),
    });
    expect(out).toEqual([
      {
        line: `assert ${TOKEN}::!{pinged(address)(uint256) ${OTHER}} == 7`,
        // Every suggestion says whose word it is.
        description: "pinged, as reported by 0x0000...0001",
        kind: "state",
        module: "t",
        event: "ping",
        emitter: TOKEN,
      },
    ]);
  });

  it("drops it when the view is missing or contradicts the event", async () => {
    for (const answer of [undefined, 8n]) {
      const out = await collectSuggestions({
        modules: [{ name: "t", events }],
        logs: [log(PING, TOKEN, { who: OTHER, value: 7n })],
        env: env(async () => answer),
      });
      expect(out).toEqual([]);
    }
  });

  it("ignores a log with the same topic0 and another indexed layout", async () => {
    const other = "event Ping(address indexed who, uint256 indexed value)";
    const out = await collectSuggestions({
      modules: [{ name: "t", events }],
      logs: [log(other, TOKEN, { who: OTHER, value: 7n })],
      env: env(async () => 7n),
    });
    expect(out).toEqual([]);
  });

  it("gives one declaration all the logs of an emitter, and removes duplicate lines", async () => {
    const out = await collectSuggestions({
      modules: [
        { name: "t", events },
        { name: "u", events },
      ],
      logs: [
        log(PING, TOKEN, { who: OTHER, value: 1n }),
        log(PING, TOKEN, { who: OTHER, value: 7n }),
      ],
      env: env(async () => 7n),
    });
    expect(out.map((s) => s.module)).toEqual(["t"]);
  });

  it("a declaration that throws loses only its own suggestions", async () => {
    const boom = defineEvent({
      ...ping,
      name: "boom",
      suggest: async () => {
        throw new Error("x");
      },
    });
    const out = await collectSuggestions({
      modules: [
        {
          name: "t",
          events: {
            boom: { load: async () => ({ default: boom }), event: PING },
          },
        },
        { name: "u", events },
      ],
      logs: [log(PING, TOKEN, { who: OTHER, value: 7n })],
      env: env(async () => 7n),
    });
    expect(out.map((s) => s.module)).toEqual(["u"]);
  });
});

describe("amount helpers", () => {
  it("lowers the floor by the tolerance on the change, rounded against the user", () => {
    expect(floorAfter(1000n, 900n, 1)).toBe(899n); // lost 100, allow 1 more
    expect(floorAfter(900n, 1000n, 1)).toBe(999n); // gained 100, allow 1 less
    expect(floorAfter(500n, 500n, 1)).toBe(500n); // unmoved: no decrease
    expect(floorAfter(10n, 9n, 1)).toBe(8n); // 1% of 1 rounds up to 1
    expect(floorAfter(1n, 0n, 50)).toBe(0n); // never below zero
  });

  it("compares addresses without case and everything else strictly", () => {
    expect(sameValue(TOKEN.toLowerCase(), TOKEN)).toBe(true);
    expect(sameValue(7n, 7n)).toBe(true);
    expect(sameValue(7n, 8n)).toBe(false);
    expect(sameValue(true, false)).toBe(false);
  });

  it("gives no native floor to the account that pays gas", () => {
    const base = env(async () => undefined);
    expect(nativeFloor({ ...base, payer: EXEC }, 10n, 9n)).toBeNull();
    expect(nativeFloor({ ...base, payer: OTHER }, 1000n, 900n)).toEqual({
      line: `assert @balance!(ETH ${EXEC}) >= 899`,
      description:
        "ETH balance of 0x0000...0002 stays at or above the simulated amount",
      kind: "amount",
    });
  });
});

describe("safeSymbol", () => {
  it("keeps a short plain symbol and refuses anything a contract could dress up", () => {
    expect(safeSymbol("USDC")).toBe("USDC");
    expect(safeSymbol("USDC.e")).toBe("USDC.e");
    expect(safeSymbol("USDC (0xA0b8...eB48) verified")).toBeUndefined();
    expect(safeSymbol("A\nB")).toBeUndefined();
    expect(safeSymbol("[x](http://evil)")).toBeUndefined();
    expect(safeSymbol("ABCDEFGHIJKLMNOPQ")).toBeUndefined();
    expect(safeSymbol("")).toBeUndefined();
  });
});

describe("bounded work", () => {
  it("reads for at most MAX_SUGGESTION_LOGS logs, however many a run emits", async () => {
    let reads = 0;
    const logs = Array.from({ length: MAX_SUGGESTION_LOGS + 100 }, (_, i) =>
      log(PING, getAddress(`0x${(i + 1).toString(16).padStart(40, "0")}`), {
        who: OTHER,
        value: 7n,
      }),
    );
    const out = await collectSuggestions({
      modules: [{ name: "t", events }],
      logs,
      env: env(async () => {
        reads++;
        return 7n;
      }),
    });
    expect(reads).toBe(MAX_SUGGESTION_LOGS);
    expect(out).toHaveLength(MAX_SUGGESTION_LOGS);
  });
});

describe("a broken declaration", () => {
  it("that does not parse or does not load loses only itself", async () => {
    const out = await collectSuggestions({
      modules: [
        {
          name: "bad",
          events: {
            unparsable: {
              load: async () => ({ default: ping }),
              event: "not an event",
            },
            unloadable: {
              load: async () => {
                throw new Error("chunk missing");
              },
              event: PING,
            },
          },
        },
        { name: "t", events },
      ],
      logs: [log(PING, TOKEN, { who: OTHER, value: 7n })],
      env: env(async () => 7n),
    });
    expect(out.map((s) => s.module)).toEqual(["t"]);
  });
});

describe("budgetedRead", () => {
  it("answers up to its budget, then answers nothing and says so", async () => {
    const budget = budgetedRead(async () => 1n, 2);
    expect(
      await budget.read(TOKEN, "function a() view returns (uint256)"),
    ).toBe(1n);
    expect(budget.exhausted()).toBe(false);
    expect(
      await budget.read(TOKEN, "function a() view returns (uint256)"),
    ).toBe(1n);
    expect(
      await budget.read(TOKEN, "function a() view returns (uint256)"),
    ).toBeUndefined();
    expect(budget.exhausted()).toBe(true);
  });
});

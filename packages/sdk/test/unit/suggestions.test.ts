import { describe, expect, it } from "bun:test";
import {
  type AbiEvent,
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Hex,
  parseAbiItem,
  parseUnits,
} from "viem";
import {
  account,
  amountText,
  atLeast,
  atMost,
  budgetedRead,
  type Candidate,
  collectSuggestions,
  contract,
  defineEvent,
  describeSentence,
  type EventImportMap,
  exactly,
  floorAfter,
  line,
  MAX_SUGGESTION_LOGS,
  nativeBalances,
  nativeCurrency,
  nativeFloor,
  type RawLog,
  renameSuggestionVariable,
  type SuggestEnv,
  type Suggestion,
  safeSymbol,
  sameValue,
  say,
  stateCandidate,
  suggestionScript,
  suggestionSource,
  symbolInList,
  type TokenInfo,
  token,
  tokenInList,
  toSuggestion,
  variableNames,
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
  nativeDecimals: 18,
  read,
});

/** A candidate as a host receives it, with names of its own run. */
const rendered = (candidate: Candidate, executor = EXEC): Suggestion =>
  toSuggestion(candidate, variableNames(executor), {
    module: "t",
    event: "e",
    emitter: TOKEN,
  });

const ping = defineEvent({
  name: "ping",
  description: "test event",
  event: PING,
  suggest: async (e, { emitter, logs }) => {
    const who = account(logs.at(-1)!.who, "account");
    const target = await contract(e, emitter, "contract");
    return stateCandidate(
      e,
      {
        address: emitter,
        signature: "function pinged(address) view returns (uint256)",
        args: [who.address],
        expect: logs.at(-1)!.value,
      },
      line`assert ${target}::!{pinged(address)(uint256) ${who}} == ${logs.at(-1)!.value}`,
      say`${who} is pinged on ${target}`,
    );
  },
});
const events: EventImportMap = {
  ping: { load: async () => ({ default: ping }), event: PING },
};

describe("collectSuggestions", () => {
  it("returns a state candidate when the view confirms the event", async () => {
    const named: string[] = [];
    const out = await collectSuggestions({
      modules: [
        { name: "t", events },
        { name: "u", events },
      ],
      logs: [log(PING, TOKEN, { who: OTHER, value: 7n })],
      env: {
        ...env(async () => 7n),
        emitterName: async (address) => {
          named.push(address);
          return "TKN";
        },
      },
    });
    expect(out).toEqual([
      {
        // Each by the role the declaration gave it: the name a contract
        // gives itself is shown in the sentence, and names no variable.
        line: "assert $contract::!{pinged(address)(uint256) $account} == 7",
        vars: [
          { name: "contract", value: TOKEN },
          { name: "account", value: OTHER },
        ],
        sentence: [
          { type: "address", address: OTHER },
          { type: "text", text: " is pinged on " },
          { type: "address", address: TOKEN, name: "TKN" },
        ],
        description: "0x0000...0003 is pinged on TKN (0x0000...0001)",
        kind: "state",
        module: "t",
        event: "ping",
        emitter: TOKEN,
        // Where it comes from, for a host to show: the event as the
        // contract names it, and the contract by the name it gives itself.
        eventName: "Ping",
        emitterName: "TKN",
      },
    ]);
    // One name lookup per emitter, however many declarations match it.
    expect(named).toEqual([TOKEN]);
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

  it("the account that pays gas gets a floor that leaves room for the fee", () => {
    const base = env(async () => undefined);
    const paying = { ...base, payer: EXEC };
    // Nothing known about the gas of the run: no floor can be assumed.
    expect(nativeFloor(paying, 1000n, 900n)).toBeNull();
    // Lost 100 in value and 5 in simulated gas; up to 50 is allowed for the
    // real fee: 1000 - 100 - 1 (tolerance) - 50.
    const floor = nativeFloor(paying, 1000n, 895n, {
      paid: 5n,
      allowance: 50n,
    });
    const shown = rendered(floor!);
    expect(shown.line).toBe(
      "assert @balance!(ETH $executor) >= 849  # base units of ETH",
    );
    expect(shown.vars).toEqual([{ name: "executor", value: EXEC }]);
    expect(shown.description).toBe(
      "0x0000...0002 keeps at least 849 base units of ETH, after up to 50 base units of ETH for gas",
    );
    expect(shown.kind).toBe("amount");
    // An allowance that swallows the whole balance asserts nothing.
    expect(
      nativeFloor(paying, 1000n, 895n, { paid: 5n, allowance: 5000n }),
    ).toBeNull();
  });

  it("an executor that does not pay gas keeps the plain floor", () => {
    const base = env(async () => undefined);
    const floor = rendered(
      nativeFloor({ ...base, payer: OTHER }, 1000n, 900n, {
        paid: 0n,
        allowance: 50n,
      })!,
    );
    expect(floor.line).toBe(
      "assert @balance!(ETH $executor) >= 899  # base units of ETH",
    );
    expect(floor.description).toBe(
      "0x0000...0002 keeps at least 899 base units of ETH",
    );
    expect(floor.kind).toBe("amount");
  });

  it("a native amount is written like a token's, exactly, and says how much", () => {
    const base = env(async () => undefined);
    // Lost 1.5 of 10: 1% of the change may be missing.
    const floor = rendered(
      nativeFloor(
        { ...base, payer: OTHER },
        10n ** 19n,
        8_500_000_000_000_000_001n,
      )!,
    );
    expect(floor.line).toBe(
      "assert @balance!(ETH $executor) >= @token:amount(ETH 8.485)",
    );
    expect(floor.sentence).toEqual([
      { type: "address", address: EXEC },
      { type: "text", text: " keeps at least " },
      {
        type: "amount",
        value: "8485000000000000000",
        bound: "floor",
        token: "native",
        symbol: "ETH",
        decimals: 18,
        text: "8.485 ETH",
      },
    ]);
    expect(floor.description).toBe("0x0000...0002 keeps at least 8.485 ETH");
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

describe("budgetedRead, for what is not a view", () => {
  it("charges the same budget, and says when it ran out", async () => {
    const budget = budgetedRead(async () => 1n, 2);
    expect(budget.charge()).toBe(true);
    expect(
      await budget.read(TOKEN, "function a() view returns (uint256)"),
    ).toBe(1n);
    expect(budget.exhausted()).toBe(false);
    expect(budget.charge()).toBe(false);
    expect(budget.exhausted()).toBe(true);
    expect(
      await budget.read(TOKEN, "function a() view returns (uint256)"),
    ).toBeUndefined();
  });
});

describe("suggestionSource", () => {
  const base = {
    line: "assert 1 == 1",
    vars: [],
    sentence: [{ type: "text" as const, text: "d" }],
    description: "d",
    kind: "state" as const,
    module: "t",
    event: "ping",
    emitter: TOKEN,
  };

  it("names the contract and the event, always with the address", () => {
    expect(
      suggestionSource({ ...base, eventName: "Transfer", emitterName: "USDC" }),
    ).toBe("Suggested by USDC (0x0000...0001)'s Transfer event");
    expect(suggestionSource({ ...base, eventName: "RoleGranted" })).toBe(
      "Suggested by 0x0000...0001's RoleGranted event",
    );
  });

  it("is absent for a suggestion that comes from no event", () => {
    expect(suggestionSource(base)).toBeUndefined();
  });
});

describe("an amount, said in the direction it is asserted", () => {
  const usdc = (bound: "floor" | "exact" | "ceiling", value: bigint) =>
    amountText(value, 6, "USDC", bound);

  it("a floor is rounded down, never up: what is said is weaker, and true", () => {
    expect(usdc("floor", 899_999_960n)).toBe("899.9999 USDC");
    expect(usdc("floor", 899_000_001n)).toBe("899 USDC");
    expect(usdc("floor", 51_950_298_220n)).toBe("51,950.2982 USDC");
    // Below one, four significant digits.
    expect(amountText(123_456_789_000_000n, 18, "WETH", "floor")).toBe(
      "0.0001234 WETH",
    );
    expect(amountText(999_999_999_999_999_999n, 18, "WETH", "floor")).toBe(
      "0.9999 WETH",
    );
  });

  it("an exact value is said in full", () => {
    expect(usdc("exact", 899_999_960n)).toBe("899.99996 USDC");
    expect(usdc("exact", 51_950_298_220n)).toBe("51,950.29822 USDC");
    expect(amountText(1_234_567_890_123_456_789n, 18, "WETH", "exact")).toBe(
      "1.234567890123456789 WETH",
    );
    // And is what is said when no direction is given.
    expect(amountText(899_999_960n, 6, "USDC")).toBe("899.99996 USDC");
  });

  it("a ceiling is rounded up", () => {
    expect(usdc("ceiling", 899_999_960n)).toBe("900 USDC");
    expect(usdc("ceiling", 899_000_001n)).toBe("899.0001 USDC");
    expect(usdc("ceiling", 899_000_100n)).toBe("899.0001 USDC");
    expect(amountText(123_456_789_000_000n, 18, "WETH", "ceiling")).toBe(
      "0.0001235 WETH",
    );
    expect(amountText(63_189_000_000_001n, 18, "XDAI", "ceiling")).toBe(
      "0.00006319 XDAI",
    );
    expect(amountText(63_190_000_000_001n, 18, "XDAI", "ceiling")).toBe(
      "0.0000632 XDAI",
    );
  });

  it("dust is in base units whatever the direction", () => {
    for (const bound of ["floor", "exact", "ceiling"] as const) {
      expect(amountText(5n, 18, "WETH", bound)).toBe("5 base units of WETH");
      expect(amountText(0n, 18, "WETH", bound)).toBe("0 WETH");
    }
  });

  it("a mention carries its direction, and its text follows it", async () => {
    const t = await token(
      {
        ...env(async () => undefined),
        token: async () => ({ symbol: "USDC", decimals: 6 }),
      },
      TOKEN,
    );
    const said = (ref: ReturnType<typeof atLeast>) => {
      const [part] = say`${ref}`;
      return part.type === "amount" ? [part.bound, part.text, part.value] : [];
    };
    // A floor is asserted at the precision it is said: its value is the
    // number shown.
    expect(said(atLeast(t, 899_999_960n))).toEqual([
      "floor",
      "899.9999 USDC",
      "899999900",
    ]);
    expect(said(exactly(t, 899_999_960n))).toEqual([
      "exact",
      "899.99996 USDC",
      "899999960",
    ]);
    expect(said(atMost(t, 899_999_960n))).toEqual([
      "ceiling",
      "900 USDC",
      "899999960",
    ]);
    // The line of a floor is the number said; an exact value and an upper
    // bound are written digit for digit.
    const written = (ref: ReturnType<typeof atLeast>) =>
      rendered({ line: line`${ref}`, sentence: say`x`, kind: "amount" }).line;
    expect(written(atLeast(t, 899_999_960n))).toBe(
      "@token:amount($token 899.9999)",
    );
    expect(written(exactly(t, 899_999_960n))).toBe(
      "@token:amount($token 899.99996)",
    );
    expect(written(atMost(t, 899_999_960n))).toBe(
      written(exactly(t, 899_999_960n)),
    );
  });

  it("a floor's line, sentence and value are one number, never above what was computed", async () => {
    const eth = nativeCurrency(env(async () => undefined));
    for (const decimals of [0, 2, 6, 18]) {
      const t = await token(
        {
          ...env(async () => undefined),
          token: async () => ({ symbol: "TKN", decimals }),
        },
        TOKEN,
      );
      for (const computed of [
        1n,
        999_999n,
        1_000_000n,
        899_999_960n,
        899_000_001n,
        51_950_298_220n,
        123_456_789_000_000n,
        999_999_999_999_999_999n,
        989_999_999_875_308_643n,
        127_019_840_673_733_935_141_936n,
        2n ** 255n,
      ]) {
        for (const of of decimals === 18 ? [t, eth] : [t]) {
          const least = atLeast(of, computed);
          const out = rendered({
            line: line`${least}`,
            sentence: say`${least}`,
            kind: "amount",
          });
          const [part] = out.sentence;
          if (part.type !== "amount") throw new Error("no amount");
          const asserted = BigInt(part.value);
          // Only ever lowered, and never to nothing.
          expect(asserted <= computed).toBe(true);
          expect(asserted > 0n).toBe(true);
          expect(asserted).toBe(least.value);
          const inLine = out.line.match(/^@token:amount\(\S+ ([\d.]+)\)$/)?.[1];
          if (inLine === undefined) {
            // Base units in both: nothing was cut.
            expect(out.line).toBe(
              `${computed}  # base units of ${of.ref === "native" ? "ETH" : "$token"}`,
            );
            expect(asserted).toBe(computed);
            expect(part.text).toContain("base units");
          } else {
            // The number in the line is the number said, digit for digit,
            // and it is `value`.
            expect(part.text.replaceAll(",", "")).toBe(
              `${inLine} ${part.symbol}`,
            );
            expect(parseUnits(inLine, decimals)).toBe(asserted);
            // Lowered by less than one unit of its last digit.
            const shown = inLine.split(".")[1]?.length ?? 0;
            expect(computed - asserted < 10n ** BigInt(decimals - shown)).toBe(
              true,
            );
          }
          expect(out.description).toBe(describeSentence(out.sentence));
        }
      }
    }
  });

  it("below one, a floor keeps four significant digits", async () => {
    const eth = nativeCurrency(env(async () => undefined));
    const least = atLeast(eth, 123_456_789_000_000n);
    expect(least.value).toBe(123_400_000_000_000n);
    expect(
      rendered({
        line: line`${least}`,
        sentence: say`${least}`,
        kind: "amount",
      }).line,
    ).toBe("@token:amount(ETH 0.0001234)");
    // The owner's example.
    const big = atLeast(eth, 127_019_840_673_733_935_141_936n);
    const out = rendered({
      line: line`assert @balance!(${eth} ${account(EXEC, "executor")}) >= ${big}`,
      sentence: say`${account(EXEC, "executor")} keeps at least ${big}`,
      kind: "amount",
    });
    expect(out.line).toBe(
      "assert @balance!(ETH $executor) >= @token:amount(ETH 127019.8406)",
    );
    expect(out.description).toBe(
      "0x0000...0002 keeps at least 127,019.8406 ETH",
    );
  });

  it("the fee a native floor leaves room for is an upper bound", () => {
    const floor = nativeFloor(
      { ...env(async () => undefined), payer: EXEC },
      10n ** 19n,
      9n * 10n ** 18n,
      { paid: 0n, allowance: 63_189_000_000_001n },
    )!;
    const [, , least, , most] = floor.sentence;
    expect(least).toMatchObject({ type: "amount", bound: "floor" });
    expect(most).toMatchObject({
      type: "amount",
      bound: "ceiling",
      value: "63189000000001",
      text: "0.00006319 ETH",
    });
    // 9, less the tolerance and the fee, is 8.98993...: said rounded down,
    // where the nearest would say 8.9899 too and 8.98996 would say 8.99.
    expect(describeSentence(floor.sentence)).toBe(
      "0x0000...0002 keeps at least 8.9899 ETH, after up to 0.00006319 ETH for gas",
    );
  });
});

describe("amountText", () => {
  it("reads as a token amount when it is one a person would say", () => {
    expect(amountText(12_500_000n, 6, "USDC")).toBe("12.5 USDC");
    expect(amountText(0n, 18, "WETH")).toBe("0 WETH");
    expect(amountText(1_000n, 6, "USDC")).toBe("0.001 USDC");
  });

  it("falls back to base units when the amount is dust", () => {
    // 0.000000000000000005 WETH helps nobody.
    expect(amountText(5n, 18, "WETH")).toBe("5 base units of WETH");
    expect(amountText(999_999_999_999n, 18, "WETH")).toBe(
      "999999999999 base units of WETH",
    );
  });
});

describe("a sentence", () => {
  const who = account(OTHER, "account");

  it("is text and mentions, and its description is the same parts as text", async () => {
    const t = await token(
      {
        ...env(async () => undefined),
        token: async () => ({ symbol: "USDC", decimals: 6 }),
      },
      TOKEN,
    );
    const sentence = say`${who} keeps at least ${atLeast(t, 51_950_298_220n)} of ${t}, ${3} times`;
    expect(sentence).toEqual([
      { type: "address", address: OTHER },
      { type: "text", text: " keeps at least " },
      {
        type: "amount",
        value: "51950298200",
        bound: "floor",
        token: TOKEN,
        symbol: "USDC",
        decimals: 6,
        text: "51,950.2982 USDC",
      },
      { type: "text", text: " of " },
      { type: "address", address: TOKEN, name: "USDC" },
      { type: "text", text: ", 3 times" },
    ]);
    // A symbol never stands alone in text: the address is beside it.
    expect(describeSentence(sentence)).toBe(
      "0x0000...0003 keeps at least 51,950.2982 USDC (0x0000...0001) of USDC (0x0000...0001), 3 times",
    );
  });

  it("an amount of a token that does not name itself is in base units of its address", async () => {
    const t = await token(
      env(async () => undefined),
      TOKEN,
    );
    expect(describeSentence(say`${exactly(t, 900n)}`)).toBe(
      "900 base units of 0x0000...0001",
    );
  });

  it("an address written as text is still a mention, in a sentence and in a line", () => {
    expect(say`owned by ${OTHER}`).toEqual([
      { type: "text", text: "owned by " },
      { type: "address", address: OTHER },
    ]);
    const shown = rendered({
      line: line`assert ${TOKEN.toLowerCase()}::!{owner()(address)} == ${OTHER}`,
      sentence: say`owned by ${OTHER}`,
      kind: "state",
    });
    expect(shown.line).toBe(
      "assert $address::!{owner()(address)} == $address2",
    );
    expect(shown.vars).toEqual([
      { name: "address", value: TOKEN },
      { name: "address2", value: OTHER },
    ]);
    // A bytes32 is not an address: it stays as written.
    const role = `0x${"ab".repeat(32)}`;
    expect(
      rendered({ line: line`assert ${role}`, sentence: say`x`, kind: "state" })
        .line,
    ).toBe(`assert ${role}`);
  });

  it("nests a sentence in a sentence", () => {
    const what = say`${7} of ${who}`;
    expect(describeSentence(say`at least ${what}`)).toBe(
      "at least 7 of 0x0000...0003",
    );
  });
});

describe("variable names", () => {
  const a = getAddress("0x00000000000000000000000000000000000b0001");
  const b = getAddress("0x00000000000000000000000000000000000b0002");

  it("gives one address one name for the run and never one name to two addresses", () => {
    const names = variableNames(EXEC);
    expect(names.nameOf(account(a, "spender"))).toBe("spender");
    expect(names.nameOf(account(b, "spender"))).toBe("spender2");
    // Seen again in another role: it keeps the name it has.
    expect(names.nameOf(account(a, "owner"))).toBe("spender");
    expect(names.nameOf(account(OTHER, "spender"))).toBe("spender3");
    // The guarded account is the executor whatever a declaration calls it.
    expect(names.nameOf(account(EXEC, "owner"))).toBe("executor");
    expect(names.nameOf(account(TOKEN, "executor"))).toBe("executor2");
  });

  it("an address told to play two roles is named for neither, unless the token list names it", () => {
    const names = variableNames(EXEC);
    names.seen(account(a, "owner"));
    names.seen(account(a, "spender"));
    names.seen(account(b, "owner"));
    names.seen(account(b, "owner"));
    names.seen(account(OTHER, "spender"));
    names.seen({
      ref: "token",
      address: OTHER,
      role: "token",
      name: "USDC",
      listed: "USDC",
    });
    names.seen(account(EXEC, "owner"));
    names.seen(account(EXEC, "spender"));
    expect(names.nameOf(account(a, "owner"))).toBe("address");
    expect(names.nameOf(account(b, "owner"))).toBe("owner");
    expect(names.nameOf(account(OTHER, "spender"))).toBe("usdc");
    expect(names.nameOf(account(EXEC, "spender"))).toBe("executor");
  });

  it("the name a contract gives itself is never a variable's", () => {
    // In a script `$usdc` reads as USDC: only the token list may say so.
    for (const name of ["USDC", "stETH", "OWNER", "executor", undefined]) {
      const own = name ? { name } : {};
      expect(
        variableNames(EXEC).nameOf({
          ref: "address",
          address: a,
          role: "contract",
          ...own,
        }),
      ).toBe("contract");
      expect(
        variableNames(EXEC).nameOf({
          ref: "token",
          address: a,
          role: "token",
          ...own,
        }),
      ).toBe("token");
    }
    // A role that is no identifier names nothing either.
    expect(variableNames(EXEC).nameOf(account(a, "the safe"))).toBe("address");
  });

  it("a token the list names is that symbol, whatever it calls itself", () => {
    const listed = (symbol: string, name?: string) =>
      variableNames(EXEC).nameOf({
        ref: "token",
        address: a,
        role: "token",
        listed: symbol,
        ...(name ? { name } : {}),
      });
    expect(listed("USDC")).toBe("usdc");
    expect(listed("stETH", "ANYTHING")).toBe("steth");
  });

  it("a listed symbol that is also a role's word shares it like any two addresses", () => {
    const names = variableNames(EXEC);
    const owner = account(b, "owner");
    const token_ = {
      ref: "token" as const,
      address: a,
      role: "token",
      listed: "OWNER",
    };
    names.seen(owner);
    names.seen(token_);
    expect(names.nameOf(owner)).toBe("owner");
    expect(names.nameOf(token_)).toBe("owner2");
    expect(names.nameOf(account(OTHER, "owner"))).toBe("owner3");
  });

  it("only uses a self-given name that is short and plain", async () => {
    const dressed = await contract(
      {
        ...env(async () => undefined),
        emitterName: async () => "USDC (0xA0b8...eB48) verified",
      },
      a,
      "contract",
    );
    expect(dressed.name).toBeUndefined();
    expect(variableNames(EXEC).nameOf(dressed)).toBe("contract");
    // A lookup that fails names nothing, and fails nothing.
    const failing = await contract(
      {
        ...env(async () => undefined),
        emitterName: async () => {
          throw new Error("rpc");
        },
      },
      a,
      "contract",
    );
    expect(failing).toEqual({ ref: "address", address: a, role: "contract" });
  });

  it("are shared by the suggestions of one run", async () => {
    const twice = defineEvent({
      ...ping,
      name: "twice",
      suggest: async (_e, { emitter, logs }) =>
        logs.map((l) => ({
          line: line`assert ${account(emitter, "contract")}::!{pinged(address)(uint256) ${account(l.who, "account")}} == ${l.value}`,
          sentence: say`${account(l.who, "account")} is pinged`,
          kind: "state" as const,
        })),
    });
    const out = await collectSuggestions({
      modules: [
        {
          name: "t",
          events: {
            twice: { load: async () => ({ default: twice }), event: PING },
          },
        },
      ],
      logs: [
        log(PING, TOKEN, { who: OTHER, value: 1n }),
        log(PING, TOKEN, { who: a, value: 2n }),
        log(PING, a, { who: OTHER, value: 3n }),
      ],
      env: env(async () => undefined),
    });
    expect(out.map((s) => s.line)).toEqual([
      "assert $contract::!{pinged(address)(uint256) $account} == 1",
      // `a` is an account here and a contract below: named for neither,
      // in both lines.
      "assert $contract::!{pinged(address)(uint256) $address} == 2",
      "assert $address::!{pinged(address)(uint256) $account} == 3",
    ]);
    expect(out[2].vars).toEqual([
      { name: "address", value: a },
      { name: "account", value: OTHER },
    ]);
  });
});

describe("a name no role and no list gives", () => {
  const a = getAddress("0x00000000000000000000000000000000000b0001");
  const b = getAddress("0x00000000000000000000000000000000000b0002");
  const c = getAddress("0x00000000000000000000000000000000000b0003");

  it("says the one thing that can be read: an account without code, a contract with it", () => {
    const names = variableNames(EXEC);
    for (const address of [a, b, c]) {
      names.seen(account(address, "owner"));
      names.seen(account(address, "spender"));
    }
    expect(names.unnamed()).toEqual([a, b, c]);
    names.is(a, "account");
    names.is(b, "contract");
    expect(names.nameOf(account(a, "owner"))).toBe("account");
    expect(names.nameOf(account(b, "owner"))).toBe("contract");
    // Nothing could be read of it.
    expect(names.nameOf(account(c, "owner"))).toBe("address");
    expect(names.unnamed()).toEqual([]);
  });

  it("is asked only where the precedence falls through", () => {
    const names = variableNames(EXEC);
    names.seen(account(a, "spender"));
    names.seen({ ref: "token", address: b, role: "token", listed: "USDC" });
    names.seen(account(b, "spender"));
    names.seen(account(EXEC, "owner"));
    names.seen(account(EXEC, "spender"));
    names.seen(account(c, "the safe"));
    expect(names.unnamed()).toEqual([c]);
    // Told anyway, it changes nothing: one role, the list and the executor
    // come first.
    for (const address of [a, b, EXEC]) names.is(address, "contract");
    expect(names.nameOf(account(a, "spender"))).toBe("spender");
    expect(names.nameOf(account(b, "spender"))).toBe("usdc");
    expect(names.nameOf(account(EXEC, "owner"))).toBe("executor");
  });

  it("shares its word like any other name", () => {
    const names = variableNames(EXEC);
    names.seen(account(a, "owner"));
    names.seen(account(a, "spender"));
    names.is(a, "account");
    expect(names.nameOf(account(b, "account"))).toBe("account");
    expect(names.nameOf(account(a, "owner"))).toBe("account2");
  });

  const twoRoles = defineEvent({
    ...ping,
    name: "twoRoles",
    suggest: async (_e, { emitter, logs }) =>
      logs.map((l) => ({
        line: line`assert ${account(emitter, "registry")}::!{pinged(address)(uint256) ${account(l.who, "member")}} == ${l.value}`,
        sentence: say`${account(l.who, "member")} is pinged`,
        kind: "state" as const,
      })),
  });
  const run = (hasCode: SuggestEnv["hasCode"]) =>
    collectSuggestions({
      modules: [
        {
          name: "t",
          events: {
            twoRoles: {
              load: async () => ({ default: twoRoles }),
              event: PING,
            },
          },
        },
      ],
      logs: [
        log(PING, TOKEN, { who: OTHER, value: 1n }),
        log(PING, TOKEN, { who: a, value: 2n }),
        log(PING, a, { who: OTHER, value: 3n }),
        log(PING, b, { who: b, value: 4n }),
      ],
      env: { ...env(async () => undefined), ...(hasCode ? { hasCode } : {}) },
    });

  it("a run reads it once per address that needs it, and names by it", async () => {
    const asked: string[] = [];
    const out = await run(async (address) => {
      asked.push(address);
      return address === a;
    });
    expect(asked).toEqual([a, b]);
    expect(out.map((s) => s.line)).toEqual([
      "assert $registry::!{pinged(address)(uint256) $member} == 1",
      // `a` is a member here and a registry below: a contract, in both.
      "assert $registry::!{pinged(address)(uint256) $contract} == 2",
      "assert $contract::!{pinged(address)(uint256) $member} == 3",
      "assert $account::!{pinged(address)(uint256) $account} == 4",
    ]);
  });

  it("stays `address` when the code cannot be read, and never loses a suggestion", async () => {
    const unknown = [
      "assert $registry::!{pinged(address)(uint256) $member} == 1",
      "assert $registry::!{pinged(address)(uint256) $address} == 2",
      "assert $address::!{pinged(address)(uint256) $member} == 3",
      "assert $address2::!{pinged(address)(uint256) $address2} == 4",
    ];
    expect((await run(undefined)).map((s) => s.line)).toEqual(unknown);
    expect((await run(async () => undefined)).map((s) => s.line)).toEqual(
      unknown,
    );
    expect(
      (
        await run(async () => {
          throw new Error("rpc");
        })
      ).map((s) => s.line),
    ).toEqual(unknown);
    // An answer that is no fact is no answer.
    expect(
      (await run((async () => "yes") as never)).map((s) => s.line),
    ).toEqual(unknown);
  });
});

describe("a token in a line", () => {
  const who = account(EXEC, "executor");
  const tokenEnv = (info: TokenInfo): SuggestEnv => ({
    ...env(async () => undefined),
    token: async () => info,
  });
  const floor = async (info: TokenInfo, value: bigint) => {
    const t = await token(tokenEnv(info), TOKEN);
    return rendered({
      line: line`assert @balance!(${t} ${who}) >= ${atLeast(t, value)}`,
      sentence: say`${who} keeps at least ${atLeast(t, value)}`,
      kind: "amount",
    });
  };

  it("is always a variable set to its address: a symbol in a line would be resolved again when the script runs", async () => {
    const out = await floor(
      { symbol: "USDC", decimals: 6, listed: "USDC" },
      51_950_298_220n,
    );
    // The token list resolves USDC to it: that names the variable.
    expect(out.line).toBe(
      "assert @balance!($usdc $executor) >= @token:amount($usdc 51950.2982)",
    );
    expect(out.vars).toEqual([
      { name: "usdc", value: TOKEN },
      { name: "executor", value: EXEC },
    ]);
    expect(suggestionScript([out]).split("\n")).toContain(`set $usdc ${TOKEN}`);
  });

  it("one that only calls itself USDC is $token, never $usdc", async () => {
    const out = await floor({ symbol: "USDC", decimals: 6 }, 51_950_298_220n);
    expect(out.line).toBe(
      "assert @balance!($token $executor) >= @token:amount($token 51950.2982)",
    );
    expect(out.vars).toEqual([
      { name: "token", value: TOKEN },
      { name: "executor", value: EXEC },
    ]);
  });

  it("a sentence says whether the list vouches for the name it shows", async () => {
    const parts = async (info: TokenInfo) => {
      const t = await token(tokenEnv(info), TOKEN);
      return say`${atLeast(t, 1_000_000n)} of ${t}`;
    };
    const [amountPart, , addressPart] = await parts({
      symbol: "USDC",
      decimals: 6,
      listed: "USDC",
    });
    expect(amountPart).toMatchObject({ symbol: "USDC", listed: true });
    expect(addressPart).toEqual({
      type: "address",
      address: TOKEN,
      name: "USDC",
      listed: true,
    });
    // A name the token gives itself and the list does not: shown, unvouched.
    for (const info of [
      { symbol: "USDC", decimals: 6 },
      { symbol: "USDC", decimals: 6, listed: "USDT" },
    ]) {
      const [selfAmount, , selfAddress] = await parts(info);
      expect(selfAmount).not.toHaveProperty("listed");
      expect(selfAddress).toEqual({
        type: "address",
        address: TOKEN,
        name: "USDC",
      });
    }
    // No name of its own: the list's.
    const [, , onlyListed] = await parts({ decimals: 6, listed: "USDC" });
    expect(onlyListed).toMatchObject({ name: "USDC", listed: true });
  });

  it("writes an exact amount digit for digit", async () => {
    const amountOf = async (info: TokenInfo, value: bigint) =>
      rendered({
        line: line`${exactly(await token(tokenEnv(info), TOKEN), value)}`,
        sentence: say`x`,
        kind: "amount",
      }).line;
    // Many decimals: nothing is rounded.
    expect(await amountOf({ decimals: 18 }, 1_234_567_890_123_456_789n)).toBe(
      "@token:amount($token 1.234567890123456789)",
    );
    // Dust.
    expect(await amountOf({ decimals: 18 }, 5n)).toBe(
      "5  # base units of $token",
    );
    // No decimals at all, and a whole number of an 18-decimal token.
    expect(await amountOf({ decimals: 0 }, 899n)).toBe(
      "@token:amount($token 899)",
    );
    expect(await amountOf({ decimals: 18 }, 3n * 10n ** 18n)).toBe(
      "@token:amount($token 3)",
    );
    // Nothing is nothing in any unit.
    expect(await amountOf({ decimals: 6 }, 0n)).toBe("0");
    // Decimals that could not be read: the base units, as they are.
    expect(await amountOf({ symbol: "TKN" }, 899n)).toBe(
      "899  # base units of $token",
    );
    expect(await amountOf({}, 899n)).toBe("899  # base units of $token");
  });

  it("a token lookup that fails leaves a plain token, and fails nothing", async () => {
    const t = await token(
      {
        ...env(async () => undefined),
        token: async () => {
          throw new Error("rpc");
        },
      },
      TOKEN,
    );
    expect(t).toEqual({ ref: "token", address: TOKEN, role: "token" });
  });

  it("the native currency is its symbol", () => {
    const eth = nativeCurrency(env(async () => undefined));
    expect(
      rendered({
        line: line`assert @balance!(${eth} ${who}) >= ${atLeast(eth, 2n * 10n ** 18n)}`,
        sentence: say`x`,
        kind: "amount",
      }).line,
    ).toBe("assert @balance!(ETH $executor) >= @token:amount(ETH 2)");
  });
});

describe("an amount is written the way it is said", () => {
  const both = (of: Parameters<typeof atLeast>[0], value: bigint) => {
    const out = rendered({
      line: line`assert x >= ${atLeast(of, value)}`,
      sentence: say`${atLeast(of, value)}`,
      kind: "amount",
    });
    return [out.line.split(">= ")[1], out.description];
  };
  const weth = async (info: TokenInfo = { symbol: "WETH", decimals: 18 }) =>
    token({ ...env(async () => undefined), token: async () => info }, TOKEN);

  it("dust is base units in the line as in the sentence, and both turn at the same value", async () => {
    const t = await weth();
    expect(both(t, 5n)).toEqual([
      "5  # base units of $token",
      "5 base units of WETH (0x0000...0001)",
    ]);
    // The last value said in base units, and the first said in WETH.
    expect(both(t, 999_999_999_999n)).toEqual([
      "999999999999  # base units of $token",
      "999999999999 base units of WETH (0x0000...0001)",
    ]);
    expect(both(t, 1_000_000_000_000n)).toEqual([
      "@token:amount($token 0.000001)",
      "0.000001 WETH (0x0000...0001)",
    ]);
    const eth = nativeCurrency(env(async () => undefined));
    expect(both(eth, 999_999_999_999n)).toEqual([
      "999999999999  # base units of ETH",
      "999999999999 base units of ETH",
    ]);
    expect(both(eth, 1_000_000_000_000n)).toEqual([
      "@token:amount(ETH 0.000001)",
      "0.000001 ETH",
    ]);
    // Nothing is nothing.
    expect(both(t, 0n)).toEqual(["0", "0 WETH (0x0000...0001)"]);
    expect(both(eth, 0n)).toEqual(["0", "0 ETH"]);
  });

  it("a token that says its decimals and not its symbol is in its units in both", async () => {
    expect(both(await weth({ decimals: 6 }), 899_999_960n)).toEqual([
      "@token:amount($token 899.9999)",
      "899.9999 of 0x0000...0001",
    ]);
    expect(both(await weth({ symbol: "WETH" }), 899n)).toEqual([
      "899  # base units of $token",
      "899 base units of WETH (0x0000...0001)",
    ]);
    expect(both(await weth({}), 899n)).toEqual([
      "899  # base units of $token",
      "899 base units of 0x0000...0001",
    ]);
  });

  it("a native currency whose decimals are not 18, or not known, stays in base units", () => {
    const base = env(async () => undefined);
    for (const nativeDecimals of [6, undefined]) {
      const coin = nativeCurrency({ ...base, nativeDecimals });
      expect(both(coin, 2n * 10n ** 18n)).toEqual([
        "2000000000000000000  # base units of ETH",
        "2000000000000000000 base units of ETH",
      ]);
      const floor = rendered(
        nativeFloor(
          { ...base, nativeDecimals, payer: OTHER },
          10n ** 19n,
          9n * 10n ** 18n,
        )!,
      );
      expect(floor.line).toBe(
        "assert @balance!(ETH $executor) >= 8990000000000000000  # base units of ETH",
      );
    }
  });

  it("a line in base units says so itself, once per token, and after everything else", async () => {
    const t = await weth();
    const eth = nativeCurrency(env(async () => undefined));
    const who = account(OTHER, "spender");
    const out = rendered({
      line: line`assert ${who}::!{f(uint256,uint256)(uint256) ${exactly(t, 5n)} ${exactly(t, 6n)}} >= ${atLeast(eth, 7n)}`,
      sentence: say`x`,
      kind: "amount",
    });
    expect(out.line).toBe(
      "assert $spender::!{f(uint256,uint256)(uint256) 5 6} >= 7  # base units of $token and ETH",
    );
    // The token is one of the line's variables even when only its unit
    // mentions it: the script sets it.
    expect(out.vars).toEqual([
      { name: "spender", value: OTHER },
      { name: "token", value: TOKEN },
    ]);
    // An amount in its token's units, and nothing, need no unit said.
    expect(
      rendered({
        line: line`assert x == ${exactly(t, 10n ** 18n)} and ${exactly(t, 0n)}`,
        sentence: say`x`,
        kind: "amount",
      }).line,
    ).toBe("assert x == @token:amount($token 1) and 0");
  });

  it("the unit follows its token through a rename, and the script still loads and sets what it needs", async () => {
    const t = await weth();
    const out = rendered({
      line: line`assert @token:allowance!(${t} ${account(EXEC, "owner")} ${account(OTHER, "spender")}) == ${exactly(t, 5n)}`,
      sentence: say`x`,
      kind: "amount",
    });
    expect(out.line).toBe(
      "assert @token:allowance!($token $executor $spender) == 5  # base units of $token",
    );
    const renamed = renameSuggestionVariable(out, "token", "weth");
    expect(renamed.line).toBe(
      "assert @token:allowance!($weth $executor $spender) == 5  # base units of $weth",
    );
    expect(renamed.vars.map((v) => v.name)).toEqual([
      "weth",
      "executor",
      "spender",
    ]);
    expect(suggestionScript([renamed]).split("\n")).toEqual([
      "load token",
      `set $weth ${TOKEN}`,
      `set $executor ${EXEC}`,
      `set $spender ${OTHER}`,
      renamed.line,
    ]);
  });

  it("a native floor alone still needs the token module, and its script loads it", () => {
    const floor = rendered(
      nativeFloor(
        { ...env(async () => undefined), payer: OTHER },
        10n ** 19n,
        9n * 10n ** 18n,
      )!,
    );
    expect(suggestionScript([floor])).toBe(
      [
        "load token",
        `set $executor ${EXEC}`,
        "assert @balance!(ETH $executor) >= @token:amount(ETH 8.99)",
      ].join("\n"),
    );
  });
});

describe("the token list", () => {
  const tokens = [
    { symbol: "DAI", chainId: 100, address: OTHER },
    { symbol: "DAI", chainId: 100, address: TOKEN },
    { symbol: "USDC.e", chainId: 100, address: EXEC },
    { symbol: "DAI", chainId: 1, address: TOKEN },
    { symbol: "xdai", chainId: 100, address: TOKEN },
  ];

  it("resolves a symbol to the first entry of the chain", () => {
    expect(tokenInList(tokens, 100, "DAI")).toBe(OTHER);
    expect(tokenInList(tokens, 1, "DAI")).toBe(TOKEN);
    expect(tokenInList(tokens, 100, "WETH")).toBeUndefined();
  });

  it("gives a token the symbol that resolves to exactly it, or none", () => {
    expect(symbolInList(tokens, 100, "XDAI", OTHER)).toBe("DAI");
    // Listed under a symbol that resolves to another token, and under one
    // that reads as the chain's own currency: neither may stand for it.
    expect(symbolInList(tokens, 100, "XDAI", TOKEN)).toBeUndefined();
    // On another chain the same entry is the first.
    expect(symbolInList(tokens, 1, "ETH", TOKEN.toLowerCase() as Address)).toBe(
      "DAI",
    );
    // A symbol that is not a plain word is not written in a line.
    expect(symbolInList(tokens, 100, "XDAI", EXEC)).toBeUndefined();
  });
});

describe("suggestionScript", () => {
  const s = (lineText: string, vars: Suggestion["vars"]): Suggestion => ({
    line: lineText,
    vars,
    sentence: [],
    description: "",
    kind: "state",
    module: "t",
    event: "e",
    emitter: TOKEN,
  });
  const a = s("assert @acl:owner!($contract) == $owner", [
    { name: "contract", value: TOKEN },
    { name: "owner", value: OTHER },
  ]);
  const b = s(
    "assert @balance!($contract $executor) >= @token:amount($contract 1.5)",
    [
      { name: "contract", value: TOKEN },
      { name: "executor", value: EXEC },
    ],
  );

  it("loads what the lines use, sets each variable once, then asserts", () => {
    expect(suggestionScript([a, b, a])).toBe(
      [
        "load acl",
        "load token",
        `set $contract ${TOKEN}`,
        `set $owner ${OTHER}`,
        `set $executor ${EXEC}`,
        a.line,
        b.line,
        a.line,
      ].join("\n"),
    );
    expect(suggestionScript([])).toBe("");
  });

  it("refuses one name for two addresses", () => {
    expect(() =>
      suggestionScript([
        a,
        s("assert 1 == 1", [{ name: "owner", value: EXEC }]),
      ]),
    ).toThrow("$owner");
  });

  it("a variable is renamed as a token, in the line and in the list", () => {
    const both = s("assert $own == $owner and $owner::!{x()(bool)}", [
      { name: "own", value: TOKEN },
      { name: "owner", value: OTHER },
    ]);
    expect(renameSuggestionVariable(both, "owner", "newOwner")).toEqual({
      ...both,
      line: "assert $own == $newOwner and $newOwner::!{x()(bool)}",
      vars: [
        { name: "own", value: TOKEN },
        { name: "newOwner", value: OTHER },
      ],
    });
  });
});

describe("balances the run emptied, and exact amounts", () => {
  const A = getAddress("0x00000000000000000000000000000000000b0001");
  const B = getAddress("0x00000000000000000000000000000000000b0002");
  const C = getAddress("0x00000000000000000000000000000000000b0003");
  const D = getAddress("0x00000000000000000000000000000000000b0004");
  const base = env(async () => undefined);
  const lines = async (e: SuggestEnv) => {
    const names = variableNames(EXEC);
    return (
      await nativeBalances(e, [
        // Received 2 on top of the 1 it had.
        { address: A, before: parseUnits("1", 18), after: parseUnits("3", 18) },
        // Sent all it had.
        { address: B, before: parseUnits("4", 18), after: 0n },
        // Sent some of it.
        { address: C, before: parseUnits("5", 18), after: parseUnits("4", 18) },
        // Untouched.
        { address: D, before: 7n, after: 7n },
        // The executor's own floor is nativeFloor's.
        { address: EXEC, before: 1n, after: 0n },
      ])
    ).map((c) => {
      const s = toSuggestion(c, names, { module: "t", event: "e", emitter: A });
      return `${s.line} | ${s.description}`;
    });
  };

  it("an executor left with none is asserted at zero, and says who can break that", () => {
    const shown = rendered(
      nativeFloor({ ...base, payer: OTHER }, parseUnits("5", 18), 0n)!,
    );
    expect(shown.line).toBe("assert @balance!(ETH $executor) == 0");
    expect(shown.description).toBe("0x0000...0002 is left with 0 ETH");
    expect(shown.kind).toBe("amount");
  });

  it("in exact mode the executor keeps exactly what the run left", () => {
    const shown = rendered(
      nativeFloor(
        { ...base, payer: OTHER, exact: true },
        parseUnits("10", 18),
        parseUnits("8.5", 18),
      )!,
    );
    expect(shown.line).toBe(
      "assert @balance!(ETH $executor) == @token:amount(ETH 8.5)",
    );
    expect(shown.description).toBe("0x0000...0002 keeps exactly 8.5 ETH");
  });

  it("the account that pays gas keeps a floor even in exact mode: its fee is not known", () => {
    const shown = rendered(
      nativeFloor({ ...base, payer: EXEC, exact: true }, 1000n, 895n, {
        paid: 5n,
        allowance: 50n,
      })!,
    );
    expect(shown.line).toContain(">=");
  });

  it("other accounts: a floor for who received, zero for who was emptied, nothing for who only sent", async () => {
    expect(await lines(base)).toEqual([
      "assert @balance!(ETH $recipient) >= @token:amount(ETH 2.98) | 0x0000...0001 holds at least 2.98 ETH",
      "assert @balance!(ETH $sender) == 0 | 0x0000...0002 is left with 0 ETH",
    ]);
  });

  it("in exact mode every account that moved is asserted at what it holds", async () => {
    expect(await lines({ ...base, exact: true })).toEqual([
      "assert @balance!(ETH $recipient) == @token:amount(ETH 3) | 0x0000...0001 holds exactly 3 ETH",
      "assert @balance!(ETH $sender) == 0 | 0x0000...0002 is left with 0 ETH",
      "assert @balance!(ETH $sender2) == @token:amount(ETH 4) | 0x0000...0003 keeps exactly 4 ETH",
    ]);
  });
});

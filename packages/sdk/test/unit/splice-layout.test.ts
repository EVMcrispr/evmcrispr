import { describe, expect, it } from "bun:test";
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  type Hex,
  padHex,
  toFunctionSelector,
  toHex,
} from "viem";
import { CORE_ABI } from "../../src/onchain/core";
import { FETCHER_TYPE, type InputParam } from "../../src/onchain/erc8211";
import { spliceLayout } from "../../src/onchain/layout";
import { concatParam } from "../../src/onchain/recipes";
import type { CompileCtx } from "../../src/onchain/types";

/**
 * A round-trip check of the splice layout.
 *
 * Every other test of this layer re-derives the ABI offsets in the test
 * with the same formula the compiler uses, so a shared misconception
 * passes both — and nothing in the suite executes the EVM. This one
 * resolves the operand tree the way the chain would (substituting a
 * concrete value for each leaf call, evaluating the handful of word
 * operators the layout emits) and then hands the assembled calldata to a
 * real ABI decoder. It fails when the FORMULA is wrong, which is the
 * failure the byte-exact tests cannot see.
 */

const CORE = "0x00000000000000000000000000000000000a55e7" as const;
const OPERATIONS = "0x000000000000000000000000000000000097e7a7" as const;

// The layout code reads only these two fields off the context.
const ctx = { core: CORE, operators: OPERATIONS } as unknown as CompileCtx;

/** Derived by name rather than hardcoded, so a signature change here
 *  fails loudly instead of silently matching nothing. */
const selectorOf = (sig: string): Hex => toFunctionSelector(`function ${sig}`);

/** The ABI envelope a `returns (bytes)` staticcall produces. */
function envelope(payload: Hex): Hex {
  return encodeAbiParameters([{ type: "bytes" }], [payload]);
}

/** A leaf live operand, keyed by a unique fake target address. */
function leaf(index: number): InputParam {
  const target = padHex(toHex(0xbeef00 + index), { size: 20 });
  return {
    paramType: 2,
    fetcherType: FETCHER_TYPE.StaticCall,
    paramData: encodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      [target, "0x"],
    ),
    constraints: [],
  };
}

/**
 * Resolve an operand the way the chain would. `values` maps a leaf's
 * fake target to the bytes envelope that call returns.
 */
function resolve(p: InputParam, values: Map<string, Hex>): Hex {
  if (p.fetcherType === FETCHER_TYPE.RawBytes) return p.paramData;

  const [target, data] = decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    p.paramData,
  ) as [string, Hex];

  if (target.toLowerCase() !== CORE.toLowerCase()) {
    const v = values.get(target.toLowerCase());
    if (!v) throw new Error(`no value for leaf ${target}`);
    return v;
  }

  const call = decodeFunctionData({ abi: CORE_ABI, data });

  if (call.functionName === "gather") {
    // Each operand resolved once, its raw bytes one element of a bytes[].
    const [args] = call.args as [InputParam[]];
    return encodeAbiParameters(
      [{ type: "bytes[]" }],
      [args.map((p) => resolve(p, values))],
    );
  }
  if (call.functionName === "nav") {
    const [inner] = call.args;
    const [payload] = decodeAbiParameters(
      [{ type: "bytes" }],
      resolve(inner as InputParam, values),
    );
    return payload;
  }
  if (call.functionName === "pick") {
    const [inner, wordIndex] = call.args as [InputParam, bigint];
    const bytes = resolve(inner, values).slice(2);
    const at = Number(wordIndex) * 64;
    return `0x${bytes.slice(at, at + 64)}`;
  }

  if (call.functionName === "read") {
    const [readTarget, selector, args] = call.args as [
      InputParam,
      Hex,
      InputParam[],
    ];
    // The layout only ever emits Operations word ops here.
    void readTarget;
    const [a, b] = args.map((x) => BigInt(resolve(x, values)));
    if (selector === selectorOf("add(uint256,uint256)")) {
      return padHex(toHex(a + b), { size: 32 });
    }
    if (selector === selectorOf("bitAnd(uint256,uint256)")) {
      return padHex(toHex(a & b), { size: 32 });
    }
    throw new Error(`unexpected operator selector ${selector}`);
  }

  throw new Error(`unexpected core call ${call.functionName}`);
}

/** Decode the outer concat call: on `read` (the gathered `bytes[]` is
 *  the only live argument, spliced last with a literal offset) assemble
 *  the calldata body from the resolved segments and hand it to a real ABI
 *  decoder; on `get` resolve the whole arguments. */
function decodeConcatParts(param: InputParam, values: Map<string, Hex>): Hex[] {
  const [target, data] = decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    param.paramData,
  ) as [string, Hex];
  expect(target.toLowerCase()).toBe(CORE.toLowerCase());
  const call = decodeFunctionData({ abi: CORE_ABI, data });
  if (call.functionName === "read") {
    const [, selector, segments] = call.args;
    expect(selector).toBe(selectorOf("concat(bytes[],bytes)"));
    const body = `0x${(segments as InputParam[])
      .map((s) => resolve(s, values).slice(2))
      .join("")}` as Hex;
    const [parts, delimiter] = decodeAbiParameters(
      [{ type: "bytes[]" }, { type: "bytes" }],
      body,
    );
    expect(delimiter).toBe("0x");
    return parts as Hex[];
  }
  expect(call.functionName).toBe("get");
  if (call.functionName !== "get") throw new Error("expected get");
  const [, selector, descriptor, args] = call.args;
  expect(selector).toBe(selectorOf("concat(bytes[],bytes)"));
  expect(descriptor).toBe("(bytes[],bytes)");
  const [parts] = decodeAbiParameters(
    [{ type: "bytes[]" }],
    resolve(args[0] as InputParam, values),
  );
  expect(
    decodeAbiParameters(
      [{ type: "bytes" }],
      resolve(args[1] as InputParam, values),
    )[0],
  ).toBe("0x");
  return parts as Hex[];
}

/** Build a concat over the given parts, resolve it, and decode it back. */
function roundTrip(parts: (Hex | { live: Hex })[]): Hex[] {
  const values = new Map<string, Hex>();
  let n = 0;
  const built = parts.map((p) => {
    if (typeof p === "string") return p;
    const l = leaf(n++);
    const [t] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      l.paramData,
    ) as [string, Hex];
    values.set(t.toLowerCase(), envelope(p.live));
    return l;
  });
  return decodeConcatParts(concatParam(ctx, built), values);
}

const hex = (len: number): Hex =>
  `0x${Array.from({ length: len }, (_, i) => ((i % 16) + 1).toString(16).padStart(2, "0")).join("")}`;

describe("gather calldata round-trip", () => {
  it("decodes a single live part back to its value", () => {
    expect(roundTrip([{ live: hex(5) }])).toEqual([hex(5)]);
  });

  it("decodes a constant part around a live one", () => {
    expect(roundTrip(["0xaabb", { live: hex(5) }, "0xcc"])).toEqual([
      "0xaabb",
      hex(5),
      "0xcc",
    ]);
  });

  // The lengths that matter: 32-aligned payloads pass even if the ceil32
  // rounding were dropped entirely, so the off-by-a-partial-word cases
  // are the ones carrying the weight.
  for (const [a, b] of [
    [0, 0],
    [1, 1],
    [31, 33],
    [32, 32],
    [33, 31],
    [64, 1],
  ] as const) {
    it(`decodes two live parts of ${a} and ${b} bytes`, () => {
      expect(roundTrip([{ live: hex(a) }, { live: hex(b) }])).toEqual([
        hex(a),
        hex(b),
      ]);
    });
  }

  it("decodes three live parts interleaved with constants", () => {
    expect(
      roundTrip([
        { live: hex(33) },
        "0xdeadbeef",
        { live: hex(1) },
        { live: hex(64) },
      ]),
    ).toEqual([hex(33), "0xdeadbeef", hex(1), hex(64)]);
  });

  it("accepts more than four live parts", () => {
    expect(
      roundTrip([
        { live: hex(1) },
        { live: hex(1) },
        { live: hex(1) },
        { live: hex(1) },
        { live: hex(1) },
      ]),
    ).toEqual(Array(5).fill(hex(1)));
  });
});

describe("spliceLayout ordering guard", () => {
  // A runtime-sized live value followed by another live one would need an
  // offset computed on-chain; that shape is `get`'s (chooseHost), so the
  // splice refuses it rather than emitting an add chain.
  it("refuses a runtime-sized live slot that is not last", () => {
    expect(() =>
      spliceLayout(ctx, [{ param: leaf(0) }, { param: leaf(1) }], 64),
    ).toThrow(/route the call through buildCall/);
    expect(() =>
      spliceLayout(
        ctx,
        [{ param: leaf(0), payload: leaf(2) }, { param: leaf(1) }],
        64,
      ),
    ).toThrow(/route the call through buildCall/);
  });

  it("allows a size-less live slot in the last position", () => {
    expect(() =>
      spliceLayout(
        ctx,
        [{ param: leaf(0), payload: 32n }, { param: leaf(1) }],
        64,
      ),
    ).not.toThrow();
  });
});

import { describe, expect, it } from "bun:test";
import {
  type AbiFunction,
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  type Hex,
  padHex,
  parseAbiItem,
  toFunctionSelector,
  toHex,
} from "viem";
import {
  type ArgSpec,
  buildCall,
  buildCallSegments,
  callParam,
  chooseHost,
} from "../../src/onchain/construct";
import { CORE_ABI, encodeRead } from "../../src/onchain/core";
import {
  FETCHER_TYPE,
  type InputParam,
  rawParam,
  staticCallParam,
  toWord,
} from "../../src/onchain/erc8211";
import { EXPRESSIONS_ABI } from "../../src/onchain/expressions";
import { bytesPayloadParam } from "../../src/onchain/layout";
import { opSelector } from "../../src/onchain/operators";
import {
  concatParam,
  enumerateParam,
  indexOfParam,
  replaceParam,
  zipParam,
} from "../../src/onchain/recipes";
import type { CompileCtx } from "../../src/onchain/types";

/**
 * The host rule of construct.ts: `read` (literal offsets, byte-identical to
 * the splice) for word-only calls and for a single runtime-sized live
 * spliced last; `get` (whole canonical arguments, resolved once in the
 * core's frame) whenever a runtime-sized live is followed by another live
 * dynamic argument. Pinned by the contracts repo's ExpressionsGas.t.sol
 * row A.
 */

const CORE = "0x00000000000000000000000000000000000a55e7" as const;
const OPERATIONS = "0x000000000000000000000000000000000097e7a7" as const;
const ctx = { core: CORE, operators: OPERATIONS } as unknown as CompileCtx;

const fn = (sig: string): AbiFunction =>
  parseAbiItem(`function ${sig} view returns (uint256)`) as AbiFunction;

function leaf(index: number): InputParam {
  const target = padHex(toHex(0xbeef00 + index), { size: 20 });
  return staticCallParam(target, "0x");
}

const word = (i: number): ArgSpec => ({ kind: "word", param: leaf(i) });
const dyn = (i: number, payload?: bigint | InputParam): ArgSpec => ({
  kind: "dyn",
  param: leaf(i),
  ...(payload === undefined ? {} : { payload }),
});
const value = (v: unknown): ArgSpec => ({ kind: "value", value: v as never });

describe("chooseHost", () => {
  const cases: [string, string, ArgSpec[], "read" | "get"][] = [
    ["word-only", "f(uint256,address)", [word(0), word(1)], "read"],
    [
      "one runtime-sized live last",
      "f(uint256,string)",
      [word(0), dyn(1)],
      "read",
    ],
    [
      "one runtime-sized live first, words after",
      "f(string,uint256)",
      [dyn(0), word(1)],
      "read",
    ],
    [
      "runtime-sized live before a constant dynamic",
      "f(string,string)",
      [dyn(0), value("k")],
      "read",
    ],
    [
      "sized live then a runtime-sized live",
      "f(bytes,string)",
      [dyn(0, 32n), dyn(1)],
      "read",
    ],
    ["two runtime-sized lives", "f(string,string)", [dyn(0), dyn(1)], "get"],
    [
      "runtime-sized live then a sized live",
      "f(string,bytes)",
      [dyn(0), dyn(1, 32n)],
      "get",
    ],
    [
      "derivable-but-runtime payload then a live",
      "f(string,string)",
      [dyn(0, leaf(9)), dyn(1)],
      "get",
    ],
    [
      "three lives around a word",
      "f(string,uint256,string,string)",
      [dyn(0), word(1), dyn(2), dyn(3)],
      "get",
    ],
  ];
  for (const [name, sig, specs, host] of cases) {
    it(`${name} → ${host}`, () => {
      expect(chooseHost(specs, fn(sig).inputs)).toBe(host);
    });
  }
});

describe("buildCall", () => {
  it("keeps the read host byte-identical to the segment splice", () => {
    for (const [sig, specs] of [
      ["f(uint256,address)", [word(0), word(1)]],
      ["f(uint256,string)", [word(0), dyn(1)]],
      ["f(string,string)", [dyn(0), value("constant tail")]],
    ] as const) {
      const abi = fn(sig);
      const target = rawParam(toWord(0x1234n));
      const call = buildCall(ctx, abi, [...specs]);
      expect(call.host).toBe("read");
      const segments = buildCallSegments(ctx, abi, [...specs]).segments;
      expect(callParam(ctx, target, call)).toEqual(
        staticCallParam(CORE, encodeRead(target, call.selector, segments)),
      );
    }
  });

  it("emits get with the tuple descriptor and whole canonical arguments", () => {
    const abi = fn("join(string,uint256,string,bytes)");
    const specs = [dyn(0), word(1), value("mid"), dyn(3)];
    const target = rawParam(toWord(0x1234n));
    const call = buildCall(ctx, abi, specs);
    expect(call.host).toBe("get");
    const param = callParam(ctx, target, call);
    expect(param.fetcherType).toBe(FETCHER_TYPE.StaticCall);
    const [to, data] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      param.paramData,
    ) as [string, Hex];
    expect(to.toLowerCase()).toBe(CORE);
    const decoded = decodeFunctionData({ abi: CORE_ABI, data });
    expect(decoded.functionName).toBe("get");
    if (decoded.functionName !== "get") throw new Error("expected get");
    const [t, selector, argumentTypes, args] = decoded.args;
    expect(t).toEqual(target);
    expect(selector).toBe(toFunctionSelector(abi));
    expect(argumentTypes).toBe("(string,uint256,string,bytes)");
    expect(args).toHaveLength(4);
    // Live arguments pass through whole; the constant is its canonical
    // single-value encoding.
    expect(args[0]).toEqual(leaf(0));
    expect(args[1]).toEqual(leaf(1));
    expect(args[2]).toEqual(
      rawParam(encodeAbiParameters([{ type: "string" }], ["mid"])),
    );
    expect(args[3]).toEqual(leaf(3));
  });

  it("never asks the splice for a runtime offset", () => {
    expect(() =>
      buildCallSegments(ctx, fn("f(string,string)"), [dyn(0), dyn(1)]),
    ).toThrow(/route through buildCall/);
  });
});

describe("Expressions surface", () => {
  it("carries no resolve-once entry point", () => {
    const names = EXPRESSIONS_ABI.filter((f) => f.type === "function").map(
      (f) => f.name,
    );
    expect(names.sort()).toEqual(["evaluate", "evaluateEncoded"]);
  });
});

/**
 * No emitted operand computes a calldata offset on-chain.
 *
 * The only reason the compiler ever rounded a payload to a word boundary
 * (`bitAnd(add(pick(env, 1), 31), ~31)`) was to place a second live
 * envelope after the first, which re-resolved that envelope once per
 * following argument. `get` hosts those shapes now, so the chain must
 * appear nowhere — including in the recipes that used to build it by
 * hand.
 */
const CEIL32_MASK = toWord((1n << 256n) - 32n);

function assertNoRuntimeOffsets(param: InputParam, path = "root"): void {
  if (param.fetcherType !== FETCHER_TYPE.StaticCall) return;
  const [target, data] = decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    param.paramData,
  ) as [string, Hex];
  if (target.toLowerCase() !== CORE.toLowerCase()) return;
  const call = decodeFunctionData({ abi: CORE_ABI, data });
  const nested: InputParam[] = [];
  if (call.functionName === "read") {
    const [readTarget, selector, segments] = call.args as [
      InputParam,
      Hex,
      InputParam[],
    ];
    const host =
      readTarget.fetcherType === FETCHER_TYPE.RawBytes
        ? BigInt(readTarget.paramData)
        : undefined;
    if (
      host === BigInt(OPERATIONS) &&
      selector === opSelector("bitAnd", false)
    ) {
      const mask = segments.find(
        (s) =>
          s.fetcherType === FETCHER_TYPE.RawBytes &&
          s.paramData.toLowerCase() === CEIL32_MASK.toLowerCase(),
      );
      expect(
        mask,
        `${path}: a payload-rounding chain reached the calldata; that shape belongs on get`,
      ).toBeUndefined();
    }
    nested.push(readTarget, ...segments);
  } else if (call.functionName === "get") {
    const [getTarget, , , args] = call.args as [
      InputParam,
      Hex,
      string,
      InputParam[],
    ];
    nested.push(getTarget, ...args);
  } else if (call.functionName === "gather") {
    nested.push(...(call.args[0] as InputParam[]));
  } else {
    for (const arg of call.args as readonly unknown[]) {
      if (arg && typeof arg === "object" && "paramData" in (arg as object)) {
        nested.push(arg as InputParam);
      }
    }
  }
  nested.forEach((child, i) => assertNoRuntimeOffsets(child, `${path}.${i}`));
}

describe("emitted recipes", () => {
  const live = (i: number) => leaf(i);
  const cases: [string, InputParam][] = [
    ["concat, one live part", concatParam(ctx, ["0xaabb", live(0)])],
    [
      "concat, six live parts",
      concatParam(
        ctx,
        Array.from({ length: 6 }, (_, i) => live(i)),
      ),
    ],
    ["indexOf, live haystack", indexOfParam(ctx, live(0), "0x2d", 0n)],
    ["indexOf, live needle", indexOfParam(ctx, live(0), live(1), 0n)],
    ["replace, live source", replaceParam(ctx, live(0), "0x2d", "0x2e")],
    ["replace, all live", replaceParam(ctx, live(0), live(1), live(2))],
    ["zip, one live side", zipParam(ctx, live(0), "0x2d")],
    ["zip, both live", zipParam(ctx, live(0), live(1))],
    ["enumerate", enumerateParam(ctx, live(0), live(1))],
  ];
  for (const [name, param] of cases) {
    it(`emits no runtime offset: ${name}`, () => {
      assertNoRuntimeOffsets(param, name);
    });
  }

  it("catches a payload-rounding chain when one is present", () => {
    // The walker is only worth having if it fails on the shape it looks
    // for: bytesPayloadParam builds exactly the chain the offset splice
    // used to emit.
    const rounding = bytesPayloadParam(ctx, leaf(0));
    expect(() => assertNoRuntimeOffsets(rounding, "rounding")).toThrow();
  });

  it("hosts the two-live shapes on get and the one-live shapes on read", () => {
    const hostOf = (param: InputParam): string => {
      const [, data] = decodeAbiParameters(
        [{ type: "address" }, { type: "bytes" }],
        param.paramData,
      ) as [string, Hex];
      return decodeFunctionData({ abi: CORE_ABI, data }).functionName;
    };
    expect(hostOf(indexOfParam(ctx, leaf(0), "0x2d", 0n))).toBe("read");
    expect(hostOf(indexOfParam(ctx, leaf(0), leaf(1), 0n))).toBe("get");
    expect(hostOf(zipParam(ctx, leaf(0), "0x2d"))).toBe("read");
    expect(hostOf(zipParam(ctx, leaf(0), leaf(1)))).toBe("get");
    // Both sides of an enumerate are runtime-sized lives.
    expect(hostOf(enumerateParam(ctx, leaf(0), leaf(1)))).toBe("get");
    // One gathered bytes[] is a single live argument: the cheaper host.
    expect(hostOf(concatParam(ctx, [live(0), live(1), live(2)]))).toBe("read");
  });
});

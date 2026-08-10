import { describe, expect, it } from "bun:test";
import {
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  type Hex,
  toFunctionSelector,
} from "viem";
import { CORE_ABI, encodeOpRead, encodePick } from "../../src/onchain/core";
import {
  FETCHER_TYPE,
  type InputParam,
  rawParam,
  staticCallParam,
  toWord,
} from "../../src/onchain/erc8211";
import {
  ELEMENT_MARKER,
  extractLambdaTemplate,
} from "../../src/onchain/lambda";
import type { CompileCtx, Operand } from "../../src/onchain/types";

/**
 * The lambda-template contract, checked the way the chain consumes it.
 *
 * A template is calldata for `target` whose 32-byte window at
 * `elemOffset` is overwritten per element, so the property that matters
 * is: write a sentinel word into that window and the DECODED call sees
 * the sentinel exactly where the element belongs. These tests perform
 * that substitution and hand the result to a real ABI decoder — they do
 * not re-derive the offset with the compiler's own formula.
 */

const CORE = "0x00000000000000000000000000000000000a55e7" as const;
const OPERATORS = "0x000000000000000000000000000000000097e7a7" as const;
const TOKEN = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" as const;

// The extractor reads only these two fields off the context.
const ctx = { core: CORE, operators: OPERATORS } as unknown as CompileCtx;

const selectorOf = (sig: string): Hex => toFunctionSelector(`function ${sig}`);
const GE = selectorOf("ge(uint256,uint256)");
const GT = selectorOf("gt(uint256,uint256)");
const ADD = selectorOf("add(uint256,uint256)");
const MUL = selectorOf("mul(uint256,uint256)");

const call = (param: InputParam): Operand => ({
  kind: "call",
  param,
  cat: "Bool",
});

/** A compiled Operators expression: `read(operators, selector, args)`
 *  calldata at the core — what the expression compiler emits. */
const opRead = (selector: Hex, args: InputParam[]): InputParam =>
  staticCallParam(CORE, encodeOpRead(OPERATORS, selector, args));

/** What the fold engine does per element: overwrite the 32-byte window
 *  at `elemOffset` with the element word. */
const SENTINEL: Hex = `0x${"ab".repeat(32)}`;
function substitute(template: Hex, elemOffset: bigint): Hex {
  const body = template.slice(2);
  const i = Number(elemOffset) * 2;
  expect(i + 64).toBeLessThanOrEqual(body.length);
  return `0x${body.slice(0, i)}${SENTINEL.slice(2)}${body.slice(i + 64)}`;
}

const decodeStaticCall = (param: InputParam): [string, Hex] =>
  decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    param.paramData,
  ) as [string, Hex];

describe("extractLambdaTemplate", () => {
  it("flattens a single direct Operators call to an Operators-target template", () => {
    const o = call(
      opRead(GE, [rawParam(ELEMENT_MARKER), rawParam(toWord(100n))]),
    );
    const tpl = extractLambdaTemplate(ctx, o, "@test");
    expect(getAddress(tpl.target)).toBe(getAddress(OPERATORS));
    // Direct Operators calldata: selector + zeroed window + the constant.
    expect(tpl.template).toBe(
      `0x${GE.slice(2)}${toWord(0n).slice(2)}${toWord(100n).slice(2)}`,
    );
    expect(substitute(tpl.template, tpl.elemOffset)).toBe(
      `0x${GE.slice(2)}${SENTINEL.slice(2)}${toWord(100n).slice(2)}`,
    );
  });

  it("keeps the whole read as a core-target template when a segment is live", () => {
    const o = call(
      opRead(GT, [
        rawParam(ELEMENT_MARKER),
        staticCallParam(TOKEN, "0x12345678"),
      ]),
    );
    const tpl = extractLambdaTemplate(ctx, o, "@test");
    expect(getAddress(tpl.target)).toBe(getAddress(CORE));
    expect(tpl.template.includes(ELEMENT_MARKER.slice(2))).toBe(false);

    // Substitute the element and decode the template as the core would.
    const decoded = decodeFunctionData({
      abi: CORE_ABI,
      data: substitute(tpl.template, tpl.elemOffset),
    });
    expect(decoded.functionName).toBe("read");
    const [readTarget, selector, segments] = decoded.args as unknown as [
      InputParam,
      Hex,
      InputParam[],
    ];
    expect(BigInt(readTarget.paramData)).toBe(BigInt(OPERATORS));
    expect(selector).toBe(GT);
    expect(segments[0].fetcherType).toBe(FETCHER_TYPE.RawBytes);
    expect(segments[0].paramData).toBe(SENTINEL);
    expect(segments[1].fetcherType).toBe(FETCHER_TYPE.StaticCall);
    const [liveTarget] = decodeStaticCall(segments[1]);
    expect(getAddress(liveTarget)).toBe(getAddress(TOKEN));
  });

  it("reaches an element window nested inside a composed expression", () => {
    // add(mul(<element>, 2), 1) — the marker sits inside the INNER read's
    // encoded calldata, two decodes deep.
    const inner = opRead(MUL, [rawParam(ELEMENT_MARKER), rawParam(toWord(2n))]);
    const o = call(opRead(ADD, [inner, rawParam(toWord(1n))]));
    const tpl = extractLambdaTemplate(ctx, o, "@test");
    expect(getAddress(tpl.target)).toBe(getAddress(CORE));

    const outer = decodeFunctionData({
      abi: CORE_ABI,
      data: substitute(tpl.template, tpl.elemOffset),
    });
    expect(outer.functionName).toBe("read");
    const [, outerSelector, segments] = outer.args as unknown as [
      InputParam,
      Hex,
      InputParam[],
    ];
    expect(outerSelector).toBe(ADD);
    expect(BigInt(segments[1].paramData)).toBe(1n);

    const [innerTarget, innerData] = decodeStaticCall(segments[0]);
    expect(getAddress(innerTarget)).toBe(getAddress(CORE));
    const innerRead = decodeFunctionData({ abi: CORE_ABI, data: innerData });
    expect(innerRead.functionName).toBe("read");
    const [, innerSelector, innerSegs] = innerRead.args as unknown as [
      InputParam,
      Hex,
      InputParam[],
    ];
    expect(innerSelector).toBe(MUL);
    expect(innerSegs[0].paramData).toBe(SENTINEL);
    expect(BigInt(innerSegs[1].paramData)).toBe(2n);
  });

  it("folds a direct non-core staticcall at its own contract", () => {
    // A single call on another contract is already the exact staticcall
    // the fold engine makes: (target, calldata) pass through verbatim.
    const data: Hex = `0x12345678${ELEMENT_MARKER.slice(2)}${toWord(7n).slice(2)}`;
    const o = call(staticCallParam(TOKEN, data));
    const tpl = extractLambdaTemplate(ctx, o, "@test");
    expect(getAddress(tpl.target)).toBe(getAddress(TOKEN));
    expect(tpl.template).toBe(
      `0x12345678${toWord(0n).slice(2)}${toWord(7n).slice(2)}`,
    );
    expect(tpl.elemOffset).toBe(4n);
    expect(substitute(tpl.template, tpl.elemOffset)).toBe(
      `0x12345678${SENTINEL.slice(2)}${toWord(7n).slice(2)}`,
    );
  });

  it("keeps a pick-wrapped call as a core-target template", () => {
    // wordAtParam / sha256Param wrap their result in the core's pick;
    // pick ABI-returns one bytes32, so the first-return-word convention
    // holds and the pick calldata is the template.
    const o = call(
      staticCallParam(CORE, encodePick(rawParam(ELEMENT_MARKER), 0n)),
    );
    const tpl = extractLambdaTemplate(ctx, o, "@test");
    expect(getAddress(tpl.target)).toBe(getAddress(CORE));
    const decoded = decodeFunctionData({
      abi: CORE_ABI,
      data: substitute(tpl.template, tpl.elemOffset),
    });
    expect(decoded.functionName).toBe("pick");
    const [picked, word] = decoded.args as unknown as [InputParam, bigint];
    expect(picked.paramData).toBe(SENTINEL);
    expect(word).toBe(0n);
  });

  it("rejects a build-time constant", () => {
    const o: Operand = { kind: "const", cat: "Bool", value: true };
    expect(() => extractLambdaTemplate(ctx, o, "@test")).toThrow(
      /build-time constant/,
    );
  });

  it("rejects a bytes- or string-producing lambda", () => {
    // The engine reads ONE return word; a bytes/string result's first
    // word is its ABI offset. The guard fires on the category alone,
    // before any template-shape inspection.
    const template = opRead(GE, [
      rawParam(ELEMENT_MARKER),
      rawParam(toWord(100n)),
    ]);
    const asBytes: Operand = { kind: "call", param: template, cat: "Bytes" };
    expect(() => extractLambdaTemplate(ctx, asBytes, "@test")).toThrow(
      /produces a Bytes value/,
    );
    const asString: Operand = { kind: "call", param: template, cat: "String" };
    expect(() => extractLambdaTemplate(ctx, asString, "@test")).toThrow(
      /produces a String value/,
    );
  });

  it("rejects a call the element never reaches", () => {
    const o = call(opRead(GE, [rawParam(toWord(1n)), rawParam(toWord(2n))]));
    expect(() => extractLambdaTemplate(ctx, o, "@test")).toThrow(
      /does not appear/,
    );
  });

  it("rejects an element used twice, on either path", () => {
    // Fast-path shape (all segments literal)…
    const flat = call(
      opRead(ADD, [rawParam(ELEMENT_MARKER), rawParam(ELEMENT_MARKER)]),
    );
    expect(() => extractLambdaTemplate(ctx, flat, "@test")).toThrow(
      /only once/,
    );
    // …and the composed shape, one occurrence nested.
    const nested = call(
      opRead(ADD, [
        rawParam(ELEMENT_MARKER),
        opRead(MUL, [rawParam(ELEMENT_MARKER), rawParam(toWord(2n))]),
      ]),
    );
    // The message names the nested-capture cause: two identical markers
    // are what an inner lambda capturing the OUTER element produces.
    expect(() => extractLambdaTemplate(ctx, nested, "@test")).toThrow(
      /nested lambda capturing the outer element/,
    );
  });
});

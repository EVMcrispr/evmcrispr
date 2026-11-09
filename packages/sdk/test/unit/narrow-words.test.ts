import { describe, expect, it } from "bun:test";
import {
  type AbiFunction,
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  parseAbiItem,
} from "viem";
import { returnWordParam } from "../../src/onchain/compile";
import { CORE_ABI } from "../../src/onchain/core";
import { type InputParam, staticCallParam } from "../../src/onchain/erc8211";
import {
  uncheckedWord,
  wordLeaf,
  wordRange,
} from "../../src/onchain/narrow-words";

const CORE = "0x00000000000000000000000000000000000a55e7" as const;
const TARGET = "0x000000000000000000000000000000000000beef" as const;
const outputs = (sig: string) =>
  (parseAbiItem(`function f() view returns ${sig}`) as AbiFunction).outputs;

/** The core function a STATIC_CALL to the core calls, and its arguments. */
function coreCall(param: InputParam) {
  const [target, data] = decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    param.paramData,
  );
  expect(target).toBe(getAddress(CORE));
  return decodeFunctionData({ abi: CORE_ABI, data });
}

describe("wordRange", () => {
  it("gives one interval for unsigned narrow types and none for full words", () => {
    expect(wordRange("uint8")).toEqual({ max: 255n });
    expect(wordRange("uint248")).toEqual({ max: (1n << 248n) - 1n });
    expect(wordRange("address")).toEqual({ max: (1n << 160n) - 1n });
    expect(wordRange("bool")).toEqual({ max: 1n });
    expect(wordRange("int8")).toEqual({});
    expect(wordRange("bytes4")).toEqual({});
    for (const t of ["uint256", "uint", "int256", "int", "bytes32", "string"])
      expect(wordRange(t)).toBeUndefined();
  });
});

describe("wordLeaf", () => {
  it("finds the value at a head word through static tuples and arrays", () => {
    const reserve = outputs(
      "((uint256 a, uint128 b, uint128 c, uint128 d, uint128 e))",
    );
    expect(wordLeaf(reserve, 2n)).toEqual({ path: [0n, 2n], type: "uint128" });
    const getData = outputs("(address owner, uint32 fuses, uint64 expiry)");
    expect(wordLeaf(getData, 1n)).toEqual({ path: [1n], type: "uint32" });
    expect(wordLeaf(getData, -1n)).toEqual({ path: [2n], type: "uint64" });
    expect(wordLeaf(outputs("(uint8[3])"), 2n)).toEqual({
      path: [0n, 2n],
      type: "uint8",
    });
    expect(wordLeaf(outputs("(uint256, (uint16, address)[2])"), 4n)).toEqual({
      path: [1n, 1n, 1n],
      type: "address",
    });
  });

  it("selects nothing at a dynamic value's offset word or past the end", () => {
    const mixed = outputs("(string, uint8)");
    expect(wordLeaf(mixed, 0n)).toBeUndefined();
    expect(wordLeaf(mixed, 1n)).toEqual({ path: [1n], type: "uint8" });
    expect(wordLeaf(mixed, -1n)).toBeUndefined();
    expect(wordLeaf(outputs("(uint8)"), 1n)).toBeUndefined();
  });
});

describe("returnWordParam", () => {
  const ctx = { core: CORE };
  const base = staticCallParam(TARGET, "0x12345678");

  it("leaves a full-word read raw", () => {
    expect(returnWordParam(ctx, base, outputs("(uint256)"))).toBe(base);
    const picked = returnWordParam(
      ctx,
      base,
      outputs("(uint256, uint256)"),
      1n,
    );
    expect(coreCall(picked).functionName).toBe("pick");
  });

  it("reads a narrow word through nav and keeps the raw read for a range judge", () => {
    const checked = returnWordParam(
      ctx,
      base,
      outputs("(address, uint32, uint64)"),
      1n,
    );
    const { functionName, args } = coreCall(checked);
    expect(functionName).toBe("nav");
    expect(args?.[1]).toBe("(address,uint32,uint64)");
    expect(args?.[2]).toEqual([1n]);
    const raw = uncheckedWord(checked);
    expect(raw?.max).toBe((1n << 32n) - 1n);
    expect(coreCall(raw!.raw).functionName).toBe("pick");

    const single = returnWordParam(ctx, base, outputs("(uint8)"));
    expect(coreCall(single).functionName).toBe("nav");
    expect(uncheckedWord(single)?.raw).toBe(base);
  });

  it("offers no raw read for a signed narrow word", () => {
    const checked = returnWordParam(ctx, base, outputs("(int96)"));
    expect(coreCall(checked).functionName).toBe("nav");
    expect(uncheckedWord(checked)).toBeUndefined();
  });
});

import { describe, expect, it } from "bun:test";
import {
  decodeFunctionData,
  encodeAbiParameters,
  type Hex,
  padHex,
  toHex,
} from "viem";
import { Num } from "../../src";
import { CORE_ADDRESS } from "../../src/onchain/addresses";
import { CORE_ABI } from "../../src/onchain/core";
import {
  abiTypeOfCategory,
  decodeResolved,
  resolveCall,
  resolveOperand,
} from "../../src/onchain/decode";
import {
  constraint,
  type InputParam,
  rawParam,
  staticCallParam,
  toWord,
} from "../../src/onchain/erc8211";
import type { Category, Operand } from "../../src/onchain/types";

/**
 * The resolved-value decoder an editor previews values with, and the one
 * `eth_call` that produces them. Every category has a case, plus the
 * words-payload array that the category alone cannot describe.
 */

const TOKEN = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" as const;
const word = (v: bigint): Hex => toWord(v);

describe("decodeResolved", () => {
  it("maps every category to its ABI type", () => {
    const expected: Record<Category, string> = {
      Uint: "uint256",
      Int: "int256",
      Address: "address",
      Bool: "bool",
      Bytes32: "bytes32",
      String: "string",
      Bytes: "bytes",
    };
    for (const [cat, type] of Object.entries(expected)) {
      expect(abiTypeOfCategory(cat as Category)).toBe(type);
    }
  });

  it("decodes a Uint word", () => {
    expect(decodeResolved(word(42n), "Uint")).toEqual({ t: "num", v: Num(42) });
  });

  it("decodes an Int word in two's complement", () => {
    expect(decodeResolved(word(-5n & ((1n << 256n) - 1n)), "Int")).toEqual({
      t: "num",
      v: Num(-5),
    });
  });

  it("divides a scaled word back into its rational", () => {
    // A ray rate: the word is the real value times 10^27.
    const v = decodeResolved(word(5n * 10n ** 25n), "Uint", 27);
    expect(v.t).toBe("num");
    expect((v as { v: Num }).v.eq(Num(5n, 100n))).toBe(true);
  });

  it("decodes an Address word", () => {
    expect(decodeResolved(padHex(TOKEN, { size: 32 }), "Address")).toEqual({
      t: "addr",
      v: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    });
  });

  it("decodes a Bool word", () => {
    expect(decodeResolved(word(1n), "Bool")).toEqual({ t: "bool", v: true });
    expect(decodeResolved(word(0n), "Bool")).toEqual({ t: "bool", v: false });
  });

  it("decodes a Bytes32 word verbatim", () => {
    const h = padHex(toHex(0xabcdn), { size: 32 });
    expect(decodeResolved(h, "Bytes32")).toEqual({ t: "hex", v: h });
  });

  it("takes only the FIRST word of a multi-word return", () => {
    const two = `0x${word(7n).slice(2)}${word(9n).slice(2)}` as Hex;
    expect(decodeResolved(two, "Uint")).toEqual({ t: "num", v: Num(7) });
  });

  it("decodes a String envelope", () => {
    const data = encodeAbiParameters([{ type: "string" }], ["WXDAI"]);
    expect(decodeResolved(data, "String")).toEqual({ t: "str", v: "WXDAI" });
  });

  it("decodes a Bytes envelope, lowercased", () => {
    const data = encodeAbiParameters([{ type: "bytes" }], ["0xABCD"]);
    expect(decodeResolved(data, "Bytes")).toEqual({ t: "hex", v: "0xabcd" });
  });

  it("decodes a uint256[] words payload with decodeAs", () => {
    // The Collections return: a bytes envelope whose payload is the bare
    // words, no length head, no offsets.
    const payload =
      `0x${word(1n).slice(2)}${word(2n).slice(2)}${word(3n).slice(2)}` as Hex;
    const data = encodeAbiParameters([{ type: "bytes" }], [payload]);
    expect(decodeResolved(data, "Bytes", 0, "uint256[]")).toEqual({
      t: "list",
      v: [
        { t: "num", v: Num(1) },
        { t: "num", v: Num(2) },
        { t: "num", v: Num(3) },
      ],
    });
  });

  it("refuses less than a word for a word category", () => {
    expect(() => decodeResolved("0x1234", "Uint")).toThrow(
      /expected at least a word/,
    );
  });
});

describe("resolveCall", () => {
  it("has nothing to call for a build-time constant", () => {
    expect(
      resolveCall({ kind: "const", cat: "Uint", value: Num(1) }),
    ).toBeUndefined();
  });

  it("targets the core and drops only the OUTER constraints", () => {
    const inner: InputParam = {
      ...staticCallParam(TOKEN, "0x12345678"),
      constraints: [constraint("Gte", 1n)],
    };
    const judged: InputParam = {
      ...staticCallParam(CORE_ADDRESS, `0xdeadbeef${inner.paramData.slice(2)}`),
      constraints: [constraint("Eq", 1n)],
    };
    const operand: Operand = { kind: "call", param: judged, cat: "Bool" };
    const call = resolveCall(operand);
    expect(call).toBeDefined();
    expect(call?.to).toBe(CORE_ADDRESS);
    const decoded = decodeFunctionData({
      abi: CORE_ABI,
      data: call?.data as Hex,
    });
    expect(decoded.functionName).toBe("resolve");
    const [param] = decoded.args as unknown as [InputParam];
    expect(param.constraints).toHaveLength(0);
    expect(param.paramData).toBe(judged.paramData);
  });
});

describe("resolveOperand", () => {
  it("makes exactly one eth_call to the core and decodes the answer", async () => {
    const seen: { to?: string; data?: Hex }[] = [];
    const client = {
      call: async (args: { to?: string; data?: Hex }) => {
        seen.push(args);
        return { data: word(42n) };
      },
    };
    const operand: Operand = {
      kind: "call",
      param: staticCallParam(TOKEN, "0x12345678"),
      cat: "Uint",
    };
    const value = await resolveOperand(client as never, operand);
    expect(value).toEqual({ t: "num", v: Num(42) });
    expect(seen).toHaveLength(1);
    expect(seen[0].to).toBe(CORE_ADDRESS);
    expect(seen[0].data).toBe(resolveCall(operand)?.data as Hex);
  });

  it("returns a constant without touching the chain", async () => {
    let calls = 0;
    const client = {
      call: async () => {
        calls++;
        return { data: word(0n) };
      },
    };
    const value = await resolveOperand(client as never, {
      kind: "const",
      cat: "Address",
      value: TOKEN,
    });
    expect(value).toEqual({
      t: "addr",
      v: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    });
    expect(calls).toBe(0);
  });

  it("evaluates as `from` when given a sender", async () => {
    const seen: { account?: unknown }[] = [];
    const client = {
      call: async (args: { account?: unknown }) => {
        seen.push(args);
        return { data: word(1n) };
      },
    };
    await resolveOperand(
      client as never,
      { kind: "call", param: rawParam(word(1n)), cat: "Bool" },
      { from: TOKEN },
    );
    expect(seen[0].account).toBe(TOKEN);
  });
});

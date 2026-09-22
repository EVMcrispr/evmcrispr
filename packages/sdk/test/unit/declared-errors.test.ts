import { describe, expect, it } from "bun:test";
import { decodeErrorResult, getAddress } from "viem";

import {
  createFail,
  DeclaredError,
  declaredAbiType,
  declaredErrorAbi,
  defineErrors,
  encodeDeclaredError,
  errorAbiFromSignature,
  errorSelector,
  extractRevertData,
  findDeclaredError,
  isChainFailure,
  Num,
  normalizeDeclaredErrorFields,
  normalizeDeclaredErrors,
  RevertError,
} from "../../src";

const ADDRESS = "0x000000000000000000000000000000000000dEaD";
const BYTES32 =
  "0x00000000000000000000000000000000000000000000000000000000000000ff";

const SHARED = defineErrors({
  NoBalance: { description: "The funder holds none of the sell token" },
  BelowMinimum: {
    description: "A part is worth less than the minimum order value",
    fields: [
      {
        name: "minimum",
        type: "number",
        description: "Minimum per part, in base units",
      },
    ],
  },
});

const ALL_SCALARS = defineErrors({
  Everything: {
    description: "One field of every supported type",
    fields: [
      { name: "amount", type: "number" },
      { name: "who", type: "address" },
      { name: "why", type: "string" },
      { name: "flag", type: "bool" },
      { name: "salt", type: "bytes32" },
    ],
  },
});

/** `fail` for a definition, catching the thrown DeclaredError. */
function failed(fail: (...args: any[]) => never, ...args: any[]) {
  try {
    (fail as any)(...args);
  } catch (err) {
    return err as DeclaredError;
  }
  throw new Error("fail() did not throw");
}

describe("defineErrors / normalizeDeclaredErrors", () => {
  it("fills in an empty field list and keeps declaration order", () => {
    const normalized = normalizeDeclaredErrors(SHARED)!;
    expect(Object.keys(normalized)).toEqual(["NoBalance", "BelowMinimum"]);
    expect(normalized.NoBalance.fields).toEqual([]);
    expect(normalized.BelowMinimum.fields).toEqual([
      {
        name: "minimum",
        type: "number",
        description: "Minimum per part, in base units",
      },
    ]);
  });

  it("returns undefined for an undeclared block", () => {
    expect(normalizeDeclaredErrors(undefined)).toBeUndefined();
  });

  it("deeply freezes a copy, leaving the source untouched", () => {
    const source = {
      Nope: {
        description: "nope",
        fields: [{ name: "why", type: "string" as const }],
      },
    };
    const normalized = normalizeDeclaredErrors(source)!;

    expect(normalized).not.toBe(source);
    expect(normalized.Nope).not.toBe(source.Nope);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.Nope)).toBe(true);
    expect(Object.isFrozen(normalized.Nope.fields)).toBe(true);
    expect(Object.isFrozen(normalized.Nope.fields[0])).toBe(true);

    // Mutating the source afterwards cannot change the normalized metadata.
    source.Nope.description = "changed";
    source.Nope.fields.push({ name: "extra", type: "string" });
    expect(normalized.Nope.description).toBe("nope");
    expect(normalized.Nope.fields).toHaveLength(1);
  });

  it("is idempotent: normalizing a normalized block changes nothing", () => {
    const once = normalizeDeclaredErrors(SHARED)!;
    const twice = normalizeDeclaredErrors(once)!;
    expect(twice).toEqual(once);
  });

  it("gives a shared spread the same metadata as an inline declaration", () => {
    const spread = normalizeDeclaredErrors({
      ...SHARED,
      SameToken: { description: "The sell and buy token are the same" },
    });
    const inline = normalizeDeclaredErrors({
      NoBalance: { description: "The funder holds none of the sell token" },
      BelowMinimum: {
        description: "A part is worth less than the minimum order value",
        fields: [
          {
            name: "minimum",
            type: "number",
            description: "Minimum per part, in base units",
          },
        ],
      },
      SameToken: { description: "The sell and buy token are the same" },
    });
    expect(spread).toEqual(inline);
  });

  it("prefixes messages with the definition label", () => {
    expect(() =>
      normalizeDeclaredErrors({ bad: { description: "x" } }, 'command "twap"'),
    ).toThrow(/^command "twap": /);
  });
});

describe("declaration validation", () => {
  it.each([
    ["lowercase", "noBalance"],
    ["leading digit", "1Bad"],
    ["dashed", "No-Balance"],
    ["empty", ""],
  ])("rejects a %s error name", (_label, name) => {
    expect(() =>
      normalizeDeclaredErrors({ [name]: { description: "x" } }),
    ).toThrow(/invalid declared error name/);
  });

  it.each(["Error", "Panic"])("rejects the reserved name %s", (name) => {
    expect(() =>
      normalizeDeclaredErrors({ [name]: { description: "x" } }),
    ).toThrow(/reserved/);
  });

  it.each([
    ["a non-object declaration", { X: "nope" }],
    ["a null declaration", { X: null }],
    ["a missing description", { X: {} }],
    ["an empty description", { X: { description: "   " } }],
    ["a non-string description", { X: { description: 7 } }],
    ["an unknown declaration property", { X: { description: "x", code: 1 } }],
    ["non-array fields", { X: { description: "x", fields: {} } }],
    ["a non-object field", { X: { description: "x", fields: ["why"] } }],
    [
      "an invalid field name",
      { X: { description: "x", fields: [{ name: "1a", type: "string" }] } },
    ],
    [
      "a missing field type",
      { X: { description: "x", fields: [{ name: "a" }] } },
    ],
    [
      "an unsupported field type",
      { X: { description: "x", fields: [{ name: "a", type: "bytes" }] } },
    ],
    [
      "an array field type",
      { X: { description: "x", fields: [{ name: "a", type: "array" }] } },
    ],
    [
      "a duplicate field name",
      {
        X: {
          description: "x",
          fields: [
            { name: "a", type: "string" },
            { name: "a", type: "number" },
          ],
        },
      },
    ],
    [
      "an unknown field property",
      {
        X: {
          description: "x",
          fields: [{ name: "a", type: "string", indexed: true }],
        },
      },
    ],
    [
      "a non-string field description",
      {
        X: {
          description: "x",
          fields: [{ name: "a", type: "string", description: 3 }],
        },
      },
    ],
  ])("rejects %s", (_label, errors) => {
    expect(() => normalizeDeclaredErrors(errors as any)).toThrow();
  });

  it("rejects a non-object errors block", () => {
    expect(() => normalizeDeclaredErrors([] as any)).toThrow(
      /errors must be an object/,
    );
  });

  it("names the offending error and field", () => {
    expect(() =>
      normalizeDeclaredErrors({
        BelowMinimum: {
          description: "x",
          fields: [{ name: "minimum", type: "uint256" }],
        },
      } as any),
    ).toThrow(/BelowMinimum.*minimum.*uint256/s);
  });
});

describe("ABI derivation", () => {
  it("maps every declared scalar to its ABI type", () => {
    expect(declaredAbiType("number")).toBe("uint256");
    expect(declaredAbiType("address")).toBe("address");
    expect(declaredAbiType("string")).toBe("string");
    expect(declaredAbiType("bool")).toBe("bool");
    expect(declaredAbiType("bytes32")).toBe("bytes32");
  });

  it("derives a named ABI error item", () => {
    const normalized = normalizeDeclaredErrors(SHARED)!;
    expect(declaredErrorAbi("BelowMinimum", normalized.BelowMinimum)).toEqual({
      type: "error",
      name: "BelowMinimum",
      inputs: [{ name: "minimum", type: "uint256" }],
    });
  });

  it("derives a selector identical to the inline signature's", () => {
    const normalized = normalizeDeclaredErrors(ALL_SCALARS)!;
    const declared = declaredErrorAbi("Everything", normalized.Everything);
    const inline = errorAbiFromSignature("Everything", [
      "uint256",
      "address",
      "string",
      "bool",
      "bytes32",
    ]);
    expect(errorSelector(declared)).toBe(errorSelector(inline));
  });

  it("derives a no-argument error item", () => {
    const normalized = normalizeDeclaredErrors(SHARED)!;
    expect(declaredErrorAbi("NoBalance", normalized.NoBalance).inputs).toEqual(
      [],
    );
  });
});

describe("fail / DeclaredError", () => {
  const fail = createFail(SHARED, 'command "swaps:twap"');

  it("throws a DeclaredError carrying name, fields, data and message", () => {
    const err = failed(fail, "BelowMinimum", { minimum: 500n }, "too small");
    expect(err).toBeInstanceOf(DeclaredError);
    expect(err.name).toBe("DeclaredError");
    expect(err.errorName).toBe("BelowMinimum");
    expect(err.message).toBe("too small");
    expect(err.fields).toEqual({ minimum: 500n });
    expect(err.revertData.startsWith("0x")).toBe(true);
  });

  it("freezes the stored field map", () => {
    const err = failed(fail, "BelowMinimum", { minimum: 1n }, "nope");
    expect(Object.isFrozen(err.fields)).toBe(true);
  });

  it("accepts the two-argument form for an error without fields", () => {
    const err = failed(fail, "NoBalance", "the funder holds none");
    expect(err.errorName).toBe("NoBalance");
    expect(err.message).toBe("the funder holds none");
    expect(err.fields).toEqual({});
  });

  it("accepts an empty field object for an error without fields", () => {
    expect(failed(fail, "NoBalance", {}, "none").fields).toEqual({});
  });

  it("rejects a nonempty field object for an error without fields", () => {
    expect(() => fail("NoBalance", { minimum: 1n } as any, "x")).toThrow(
      /NoBalance.*no fields/s,
    );
  });

  it("rejects an undeclared error name", () => {
    expect(() => (fail as any)("Whoops", "x")).toThrow(
      /unknown declared error "Whoops"/,
    );
  });

  it("rejects a missing or empty raise-site message", () => {
    expect(() => (fail as any)("NoBalance")).toThrow(/message/);
    expect(() => (fail as any)("NoBalance", "  ")).toThrow(/message/);
    expect(() => (fail as any)("BelowMinimum", { minimum: 1n }, 7)).toThrow(
      /message/,
    );
  });

  it("refuses every name when nothing is declared", () => {
    const none = createFail(undefined, 'helper "@token:holdings"');
    expect(() => (none as any)("NoBalance", "x")).toThrow(/declares no errors/);
  });

  it("is not a RevertError and not a chain failure", () => {
    const err = failed(fail, "NoBalance", "none");
    expect(err instanceof RevertError).toBe(false);
    expect(isChainFailure(err)).toBe(false);
    expect(isChainFailure(new Error("wrapped", { cause: err }))).toBe(false);
  });
});

describe("fail typing", () => {
  // Compile-time expectations: `bun test` ignores them, `tsc` enforces them.
  const fail = createFail(SHARED);

  it("types names and field maps against the declaration", () => {
    expect(() => fail("BelowMinimum", { minimum: 1n }, "small")).toThrow();
    expect(() => fail("BelowMinimum", { minimum: Num(1n) }, "small")).toThrow();
    expect(() => fail("NoBalance", "none")).toThrow();
    expect(() => fail("NoBalance", {}, "none")).toThrow();
    // @ts-expect-error undeclared name
    expect(() => fail("Whoops", "none")).toThrow();
    // @ts-expect-error a number field takes no string
    expect(() => fail("BelowMinimum", { minimum: "1" }, "small")).toThrow();
    // @ts-expect-error unknown field
    expect(() => fail("BelowMinimum", { floor: 1n }, "small")).toThrow();
    // @ts-expect-error the raise-site message is mandatory
    expect(() => fail("BelowMinimum", { minimum: 1n })).toThrow();
    // @ts-expect-error an error with fields has no two-argument form
    expect(() => fail("BelowMinimum", "small")).toThrow();
  });
});

describe("field validation and encoding", () => {
  const normalized = normalizeDeclaredErrors(ALL_SCALARS)!;
  const def = normalized.Everything;
  const abi = declaredErrorAbi("Everything", def);
  const fail = createFail(ALL_SCALARS);

  const valid = {
    amount: 1000n,
    who: ADDRESS,
    why: "because",
    flag: true,
    salt: BYTES32,
  };

  it("round-trips every scalar through the ABI encoding", () => {
    const err = failed(fail, "Everything", valid, "boom");
    const decoded = decodeErrorResult({ abi: [abi], data: err.revertData });
    expect(decoded.errorName).toBe("Everything");
    expect(decoded.args).toEqual([
      1000n,
      getAddress(ADDRESS),
      "because",
      true,
      BYTES32,
    ]);
  });

  it("encodes a no-field error as its bare selector", () => {
    const shared = normalizeDeclaredErrors(SHARED)!;
    const data = encodeDeclaredError("NoBalance", shared.NoBalance, {});
    expect(data).toBe(
      errorSelector(declaredErrorAbi("NoBalance", shared.NoBalance)),
    );
  });

  it("checksums addresses", () => {
    const fields = normalizeDeclaredErrorFields("Everything", def, {
      ...valid,
      who: ADDRESS.toLowerCase(),
    });
    expect(fields.who).toBe(getAddress(ADDRESS));
  });

  it.each([
    ["a bigint", 42n, 42n],
    ["zero", 0n, 0n],
    ["a safe JS integer", 7, 7n],
    ["an integral Num", Num(9n), 9n],
    ["the uint256 maximum", (1n << 256n) - 1n, (1n << 256n) - 1n],
  ])("accepts %s for a number field", (_label, input, expected) => {
    const fields = normalizeDeclaredErrorFields("Everything", def, {
      ...valid,
      amount: input,
    });
    expect(fields.amount).toBe(expected);
  });

  it.each([
    ["a fractional Num", Num("1.5")],
    ["a negative bigint", -1n],
    ["a negative number", -1],
    ["a negative Num", Num(-1n)],
    ["an overflowing bigint", 1n << 256n],
    ["a fractional JS number", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["an unsafe JS integer", 2 ** 53],
    ["a numeric string", "10"],
    ["a boolean", true],
    ["null", null],
  ])("rejects %s for a number field", (_label, input) => {
    expect(() =>
      normalizeDeclaredErrorFields("Everything", def, {
        ...valid,
        amount: input,
      } as any),
    ).toThrow(/amount/);
  });

  it.each([
    ["a non-address string", "not-an-address"],
    ["a short hex string", "0xdead"],
    ["a number", 1],
  ])("rejects %s for an address field", (_label, input) => {
    expect(() =>
      normalizeDeclaredErrorFields("Everything", def, {
        ...valid,
        who: input,
      } as any),
    ).toThrow(/who/);
  });

  it.each([
    ["a short hex string", "0xff"],
    ["a non-hex string", "salt"],
    ["a bigint", 255n],
  ])("rejects %s for a bytes32 field", (_label, input) => {
    expect(() =>
      normalizeDeclaredErrorFields("Everything", def, {
        ...valid,
        salt: input,
      } as any),
    ).toThrow(/salt/);
  });

  it.each([
    ['the string "true"', "true"],
    ["a number", 1],
  ])("rejects %s for a bool field", (_label, input) => {
    expect(() =>
      normalizeDeclaredErrorFields("Everything", def, {
        ...valid,
        flag: input,
      } as any),
    ).toThrow(/flag/);
  });

  it.each([
    ["a number", 7],
    ["a bigint", 7n],
    ["an object", { toString: () => "x" }],
  ])("rejects %s for a string field", (_label, input) => {
    expect(() =>
      normalizeDeclaredErrorFields("Everything", def, {
        ...valid,
        why: input,
      } as any),
    ).toThrow(/why/);
  });

  it("rejects a missing field", () => {
    const { amount: _omitted, ...rest } = valid;
    expect(() =>
      normalizeDeclaredErrorFields("Everything", def, rest as any),
    ).toThrow(/missing field "amount"/);
  });

  it("rejects an extra field", () => {
    expect(() =>
      normalizeDeclaredErrorFields("Everything", def, {
        ...valid,
        extra: 1,
      } as any),
    ).toThrow(/unexpected field "extra"/);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an array", []],
    ["a string", "minimum"],
  ])("rejects %s as the field map of an error with fields", (_label, input) => {
    expect(() =>
      normalizeDeclaredErrorFields("Everything", def, input as any),
    ).toThrow(/fields/);
  });

  it("freezes the normalized field map", () => {
    const fields = normalizeDeclaredErrorFields("Everything", def, valid);
    expect(Object.isFrozen(fields)).toBe(true);
  });
});

describe("extractRevertData and the cause walk", () => {
  const fail = createFail(SHARED);

  it("reads a DeclaredError's revert data", () => {
    const err = failed(fail, "BelowMinimum", { minimum: 5n }, "too small");
    const data = extractRevertData(err);
    expect(data).toBe(err.revertData);
    expect(
      decodeErrorResult({
        abi: [
          declaredErrorAbi("BelowMinimum", {
            description: "x",
            fields: [{ name: "minimum", type: "number" }],
          }),
        ],
        data: data!,
      }).args,
    ).toEqual([5n]);
  });

  it("reads a structurally revived DeclaredError (worker boundary)", () => {
    const err = failed(fail, "BelowMinimum", { minimum: 5n }, "too small");
    const revived = {
      name: "DeclaredError",
      message: err.message,
      errorName: "BelowMinimum",
      revertData: err.revertData,
    };
    expect(extractRevertData(revived)).toBe(err.revertData);
    expect(isChainFailure(revived)).toBe(false);
  });

  it("reads revert data through a wrapper's cause", () => {
    const err = failed(fail, "NoBalance", "none");
    const wrapped = new Error("@helper(1:1,1:9): failed", { cause: err });
    expect(extractRevertData(wrapped)).toBe(err.revertData);
  });

  it.each([
    ["a non-hex revertData", "nope"],
    ["an odd-length revertData", "0x123"],
    ["a numeric revertData", 1234],
  ])("ignores %s", (_label, revertData) => {
    expect(extractRevertData({ name: "X", revertData })).toBeUndefined();
  });

  it("survives a cause cycle", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    (a as any).cause = b;
    expect(extractRevertData(a)).toBeUndefined();
    expect(findDeclaredError(a)).toBeUndefined();
  });

  it("finds a DeclaredError nested a few wrappers deep", () => {
    const err = failed(fail, "NoBalance", "none");
    let wrapped: Error = err;
    for (let i = 0; i < 5; i++) {
      wrapped = new Error(`wrapper ${i}`, { cause: wrapped });
    }
    expect(findDeclaredError(wrapped)).toBe(err);
  });

  it("stops walking beyond its depth bound", () => {
    const err = failed(fail, "NoBalance", "none");
    let wrapped: Error = err;
    for (let i = 0; i < 40; i++) {
      wrapped = new Error(`wrapper ${i}`, { cause: wrapped });
    }
    expect(findDeclaredError(wrapped)).toBeUndefined();
  });

  it("returns undefined for an ordinary error", () => {
    expect(findDeclaredError(new Error("plain"))).toBeUndefined();
    expect(findDeclaredError(undefined)).toBeUndefined();
  });
});

import { describe, expect, it } from "bun:test";
import type { Abi } from "viem";
import { encodeErrorResult, parseAbi } from "viem";

import {
  BindingsManager,
  BindingsSpace,
  captureListRequiresFailure,
  createFail,
  declaredErrorEntries,
  defineErrors,
  type ErrorCaptureNode,
  ErrorException,
  failureTiming,
  NodeType,
  normalizeDeclaredErrors,
  RevertError,
  resolveErrorCaptures,
  selectCaptureErrorAbis,
} from "../../src";

const { USER } = BindingsSpace;

// ── fixtures ────────────────────────────────────────────────────────────

const COMMAND_ERRORS = defineErrors({
  SameToken: { description: "sell and buy token are the same" },
  BelowMinimum: {
    description: "the order is under the venue minimum",
    fields: [
      { name: "minimum", type: "number" },
      { name: "token", type: "address" },
    ],
  },
  Shared: { description: "declared by the command with no fields" },
});

const HELPER_ERRORS = defineErrors({
  NoExplorer: {
    description: "the chain has no supported explorer",
    fields: [{ name: "chainId", type: "number" }],
  },
  Shared: {
    description: "declared by the helper with a different signature",
    fields: [{ name: "which", type: "number" }],
  },
});

const commandEntries = declaredErrorEntries(
  "command",
  "swaps:twap",
  normalizeDeclaredErrors(COMMAND_ERRORS),
);
const helperEntries = declaredErrorEntries(
  "helper",
  "@token:holdings",
  normalizeDeclaredErrors(HELPER_ERRORS),
);

/** Command declarations only — no `Shared` collision. */
const COMMAND_ONLY = commandEntries;
/** The command's declarations plus a helper's, `Shared` colliding. */
const UNION = [...commandEntries, ...helperEntries];

const commandFail = createFail(COMMAND_ERRORS, 'command "swaps:twap"');
const helperFail = createFail(HELPER_ERRORS, 'helper "@token:holdings"');

const TOKEN = "0x000000000000000000000000000000000000dEaD" as const;

/** Run `fail(...)` and hand back the thrown `DeclaredError`. */
function raised(run: () => never): unknown {
  try {
    run();
  } catch (err) {
    return err;
  }
  throw new Error("expected fail() to throw");
}

/**
 * A capture clause. The timing defaults to `"revert"` (the `-!>` / `-?!>`
 * family); refusal cases pass `"refusal"` explicitly.
 */
function capture(
  spec: Partial<ErrorCaptureNode>,
  timing: ErrorCaptureNode["timing"] = "revert",
): ErrorCaptureNode {
  return {
    type: NodeType.ErrorCapture,
    timing,
    optional: true,
    captures: [],
    ...spec,
  } as ErrorCaptureNode;
}

function run(
  error: unknown,
  captures: ErrorCaptureNode[],
  sources?: { abi?: Abi; declared?: typeof UNION },
) {
  const bindings = new BindingsManager();
  const result = resolveErrorCaptures(error, sources, captures, bindings);
  return {
    result,
    value: (name: string) => bindings.getBindingValue(name, USER),
    bindings,
  };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("expected resolveErrorCaptures to throw");
}

const ERROR_STRING_ABI = parseAbi(["error Error(string)"]);
const PANIC_ABI = parseAbi(["error Panic(uint256)"]);

// ── tests ───────────────────────────────────────────────────────────────

describe("resolveErrorCaptures — alternation", () => {
  it("accepts the failure when any clause matches", async () => {
    const err = raised(() =>
      commandFail("BelowMinimum", { minimum: 5n, token: TOKEN }, "too small"),
    );
    const { result, value } = run(
      err,
      [
        capture({ errorName: "SameToken", boolVar: "same" }, "refusal"),
        capture({ errorName: "BelowMinimum", boolVar: "small" }, "refusal"),
      ],
      { declared: COMMAND_ONLY },
    );
    await result;
    expect(value("$same")).toBe("false");
    expect(value("$small")).toBe("true");
  });

  it("applies only the matching clause's destructure, in source order", async () => {
    const err = raised(() =>
      commandFail("BelowMinimum", { minimum: 5n, token: TOKEN }, "too small"),
    );
    const { result, value } = run(
      err,
      [
        capture({ errorName: "SameToken", captures: ["ignored"] }, "refusal"),
        capture(
          { errorName: "BelowMinimum", captures: ["min", "token"] },
          "refusal",
        ),
      ],
      { declared: COMMAND_ONLY },
    );
    await result;
    expect(value("$ignored")).toBeUndefined();
    expect(String(value("$min"))).toBe("5");
    expect(String(value("$token")).toLowerCase()).toBe(TOKEN.toLowerCase());
  });

  it("sets every matching clause's flag and destructure", async () => {
    const err = raised(() =>
      commandFail("BelowMinimum", { minimum: 5n, token: TOKEN }, "too small"),
    );
    const { result, value } = run(
      err,
      [
        capture({ errorName: "BelowMinimum", boolVar: "a" }, "refusal"),
        capture(
          {
            errorName: "BelowMinimum",
            errorParams: ["uint256", "address"],
            captures: ["min", null],
          },
          "refusal",
        ),
      ],
      { declared: COMMAND_ONLY },
    );
    await result;
    expect(value("$a")).toBe("true");
    expect(String(value("$min"))).toBe("5");
  });
});

describe("resolveErrorCaptures — no clause matches", () => {
  it("throws the original error object by identity", async () => {
    const err = new RevertError(
      "Transaction reverted",
      encodeErrorResult({
        abi: ERROR_STRING_ABI,
        errorName: "Error",
        args: ["not enough tokens"],
      }),
    );
    const { result } = run(
      err,
      [capture({ errorName: "SameToken", boolVar: "same" })],
      { declared: COMMAND_ONLY },
    );
    expect(await caught(result)).toBe(err);
  });

  it("publishes no bindings at all when nothing matched", async () => {
    const err = new RevertError("Transaction reverted");
    const { result, value } = run(err, [
      capture({ errorName: "Error", boolVar: "reason" }),
      capture({ errorName: "Panic", captures: ["code"] }),
    ]);
    await caught(result);
    expect(value("$reason")).toBeUndefined();
    expect(value("$code")).toBeUndefined();
  });

  it("throws a non-Error failure value by identity too", async () => {
    const err = { nope: true };
    const { result } = run(err, [capture({ errorName: "SameToken" })], {
      declared: COMMAND_ONLY,
    });
    expect(await caught(result)).toBe(err);
  });

  it("treats an unavailable bare name as a mismatch, not a script error", async () => {
    const err = new RevertError(
      "Transaction reverted",
      encodeErrorResult({
        abi: ERROR_STRING_ABI,
        errorName: "Error",
        args: ["boom"],
      }),
    );
    const { result } = run(err, [
      capture({ errorName: "NeverHeardOfIt", boolVar: "e" }),
    ]);
    expect(await caught(result)).toBe(err);
  });
});

describe("resolveErrorCaptures — generic clauses", () => {
  it("accepts a failure no named clause matches", async () => {
    const err = raised(() =>
      commandFail("BelowMinimum", { minimum: 5n, token: TOKEN }, "too small"),
    );
    const { result, value } = run(
      err,
      [
        capture({ boolVar: "any" }, "refusal"),
        capture({ errorName: "SameToken", boolVar: "same" }, "refusal"),
      ],
      { declared: COMMAND_ONLY },
    );
    await result;
    expect(value("$any")).toBe("true");
    expect(value("$same")).toBe("false");
  });

  it("binds a declared error's raise-site message", async () => {
    const err = raised(() => commandFail("SameToken", {}, "same token"));
    const { result, value } = run(
      err,
      [capture({ captures: ["reason"] }, "refusal")],
      { declared: COMMAND_ONLY },
    );
    await result;
    expect(value("$reason")).toBe("same token");
  });

  it("binds the raise-site message through a wrapper", async () => {
    const declared = raised(() =>
      helperFail("NoExplorer", { chainId: 100n }, "no explorer for gnosis"),
    );
    const wrapper = new ErrorException("helper @token:holdings failed");
    wrapper.cause = declared;
    const { result, value } = run(
      wrapper,
      [capture({ captures: ["reason"] }, "refusal")],
      { declared: UNION },
    );
    await result;
    expect(value("$reason")).toBe("no explorer for gnosis");
  });

  it("binds an ordinary pre-send failure's message", async () => {
    const err = new ErrorException("encoding failed");
    const { result, value } = run(err, [
      capture({ captures: ["reason"] }, "refusal"),
    ]);
    await result;
    expect(value("$reason")).toBe("encoding failed");
  });

  it("keeps chain-failure decoding", async () => {
    const err = new RevertError(
      "Transaction reverted",
      encodeErrorResult({
        abi: ERROR_STRING_ABI,
        errorName: "Error",
        args: ["not enough tokens"],
      }),
    );
    const { result, value } = run(err, [capture({ captures: ["reason"] })]);
    await result;
    expect(value("$reason")).toBe("not enough tokens");
  });
});

describe("resolveErrorCaptures — built-ins", () => {
  it("captures Error(string) by bare name", async () => {
    const err = new RevertError(
      "Transaction reverted",
      encodeErrorResult({
        abi: ERROR_STRING_ABI,
        errorName: "Error",
        args: ["not enough tokens"],
      }),
    );
    const { result, value } = run(err, [
      capture({ errorName: "Error", captures: ["reason"] }),
    ]);
    await result;
    expect(value("$reason")).toBe("not enough tokens");
  });

  it("captures Panic(uint256) by bare name", async () => {
    const err = new RevertError(
      "Transaction reverted",
      encodeErrorResult({
        abi: PANIC_ABI,
        errorName: "Panic",
        args: [18n],
      }),
    );
    const { result, value } = run(err, [
      capture({ errorName: "Panic", captures: ["code"] }),
    ]);
    await result;
    expect(String(value("$code"))).toBe("18");
  });

  it("does not let Panic data satisfy an Error(string) clause", async () => {
    const err = new RevertError(
      "Transaction reverted",
      encodeErrorResult({ abi: PANIC_ABI, errorName: "Panic", args: [18n] }),
    );
    const { result } = run(err, [
      capture({ errorName: "Error", captures: ["reason"] }),
    ]);
    expect(await caught(result)).toBe(err);
  });
});

describe("resolveErrorCaptures — signature selection", () => {
  const SAME_TOKEN_ARG_ABI = parseAbi(["error SameToken(uint256)"]);
  const SAME_TOKEN_ABI = parseAbi(["error SameToken()"]);

  it("matches an on-chain error whose signature equals the ABI's", async () => {
    const err = new RevertError(
      "Transaction reverted",
      encodeErrorResult({ abi: SAME_TOKEN_ABI, errorName: "SameToken" }),
    );
    const { result, value } = run(
      err,
      [capture({ errorName: "SameToken", boolVar: "same" })],
      { abi: SAME_TOKEN_ABI as Abi },
    );
    await result;
    expect(value("$same")).toBe("true");
  });

  it("does not match a same-named on-chain error of another signature", async () => {
    const err = new RevertError(
      "Transaction reverted",
      encodeErrorResult({
        abi: SAME_TOKEN_ARG_ABI,
        errorName: "SameToken",
        args: [7n],
      }),
    );
    const { result } = run(
      err,
      [capture({ errorName: "SameToken", boolVar: "same" })],
      { abi: SAME_TOKEN_ABI as Abi },
    );
    expect(await caught(result)).toBe(err);
  });

  it("captures that other signature when spelled inline", async () => {
    const err = new RevertError(
      "Transaction reverted",
      encodeErrorResult({
        abi: SAME_TOKEN_ARG_ABI,
        errorName: "SameToken",
        args: [7n],
      }),
    );
    const { result, value } = run(
      err,
      [
        capture({
          errorName: "SameToken",
          errorParams: ["uint256"],
          captures: ["n"],
        }),
      ],
      { declared: COMMAND_ONLY },
    );
    await result;
    expect(String(value("$n"))).toBe("7");
  });

  it("ignores a same-named declaration for a revert clause", async () => {
    const abi = parseAbi(["error SameToken(uint256)"]) as Abi;
    const err = new RevertError(
      "Transaction reverted",
      encodeErrorResult({
        abi: SAME_TOKEN_ARG_ABI,
        errorName: "SameToken",
        args: [7n],
      }),
    );
    // The declared no-arg signature is a refusal shape; a revert clause
    // reads the contract ABI only, so the one-arg on-chain error matches.
    const { result, value } = run(
      err,
      [capture({ errorName: "SameToken", captures: ["n"] })],
      { abi, declared: COMMAND_ONLY },
    );
    await result;
    expect(String(value("$n"))).toBe("7");
  });

  it("decodes a contract error with the failing action's ABI", async () => {
    const abi = parseAbi(["error InsufficientBalance(uint256,uint256)"]) as Abi;
    const err = new RevertError(
      "Transaction reverted",
      encodeErrorResult({
        abi,
        errorName: "InsufficientBalance",
        args: [50n, 200n],
      }),
    );
    const { result, value } = run(
      err,
      [
        capture({
          errorName: "InsufficientBalance",
          captures: ["available", "required"],
        }),
      ],
      { abi, declared: COMMAND_ONLY },
    );
    await result;
    expect(String(value("$available"))).toBe("50");
    expect(String(value("$required"))).toBe("200");
  });

  it("matches an overloaded contract error that is not the ABI's first item", async () => {
    // getAbiItem({ abi, name }) would pick `Dup()`; the overload that
    // actually reverted is the second item.
    const abi = parseAbi(["error Dup()", "error Dup(uint256)"]) as Abi;
    const err = new RevertError(
      "Transaction reverted",
      encodeErrorResult({ abi, errorName: "Dup", args: [3n] }),
    );
    const { result, value } = run(
      err,
      [capture({ errorName: "Dup", captures: ["n"] })],
      { abi },
    );
    await result;
    expect(String(value("$n"))).toBe("3");
  });

  it("dedupes identical declared signatures instead of calling them ambiguous", async () => {
    const twice = [
      ...declaredErrorEntries(
        "command",
        "swaps:twap",
        normalizeDeclaredErrors(COMMAND_ERRORS),
      ),
      ...declaredErrorEntries(
        "helper",
        "@swaps:quote",
        normalizeDeclaredErrors(COMMAND_ERRORS),
      ),
    ];
    const err = raised(() => commandFail("SameToken", {}, "same token"));
    const { result, value } = run(
      err,
      [capture({ errorName: "SameToken", boolVar: "same" }, "refusal")],
      { declared: twice },
    );
    await result;
    expect(value("$same")).toBe("true");
  });
});

describe("resolveErrorCaptures — invalid captures are script errors", () => {
  it("rejects a bare name declared with two different signatures", async () => {
    const err = raised(() => commandFail("Shared", {}, "shared"));
    const { result } = run(err, [capture({ errorName: "Shared" }, "refusal")], {
      declared: UNION,
    });
    const thrown = await caught(result);
    expect(thrown).toBeInstanceOf(ErrorException);
    expect((thrown as Error).message).toMatch(/more than one signature/);
    expect((thrown as Error).message).toContain("swaps:twap");
    expect((thrown as Error).message).toContain("@token:holdings");
  });

  it("refuses the ambiguous name even when another clause matches", async () => {
    const err = raised(() => commandFail("SameToken", {}, "same token"));
    const { result } = run(
      err,
      [
        capture({ errorName: "SameToken", boolVar: "same" }, "refusal"),
        capture({ errorName: "Shared", boolVar: "shared" }, "refusal"),
      ],
      { declared: UNION },
    );
    const thrown = await caught(result);
    expect((thrown as Error).message).toMatch(/more than one signature/);
  });

  it("rejects a malformed inline signature", async () => {
    const err = new RevertError("Transaction reverted");
    const { result } = run(err, [
      capture({ errorName: "Bad", errorParams: ["uint9000"] }),
    ]);
    const thrown = await caught(result);
    expect(thrown).toBeInstanceOf(ErrorException);
    expect((thrown as Error).message).toMatch(/invalid inline error signature/);
  });

  it("rejects an invalid destructure on a matching clause", async () => {
    const err = raised(() => commandFail("SameToken", {}, "same token"));
    const { result } = run(
      err,
      [
        capture(
          { errorName: "SameToken", captures: ["one", "two"] },
          "refusal",
        ),
      ],
      { declared: COMMAND_ONLY },
    );
    const thrown = await caught(result);
    expect(thrown).toBeInstanceOf(ErrorException);
    expect(thrown).not.toBe(err);
  });
});

describe("resolveErrorCaptures — malformed payloads", () => {
  it("treats a truncated payload with the right selector as a mismatch", async () => {
    const abi = parseAbi(["error BelowMinimum(uint256,address)"]) as Abi;
    const full = encodeErrorResult({
      abi: parseAbi(["error BelowMinimum(uint256,address)"]),
      errorName: "BelowMinimum",
      args: [5n, TOKEN],
    });
    const truncated = full.slice(0, 50) as `0x${string}`;
    const err = new RevertError("Transaction reverted", truncated);
    const { result, value } = run(
      err,
      [capture({ errorName: "BelowMinimum", captures: ["min", "token"] })],
      { abi },
    );
    expect(await caught(result)).toBe(err);
    expect(value("$min")).toBeUndefined();
  });

  it("treats an empty revert as a mismatch for a named clause", async () => {
    const err = new RevertError("Transaction reverted", "0x");
    const { result } = run(
      err,
      [capture({ errorName: "SameToken", boolVar: "same" })],
      { abi: parseAbi(["error SameToken()"]) as Abi },
    );
    expect(await caught(result)).toBe(err);
  });
});

describe("resolveErrorCaptures — declared helper failures", () => {
  const declaredErr = () =>
    raised(() =>
      helperFail("NoExplorer", { chainId: 100n }, "no explorer for gnosis"),
    );

  it("is accepted by an optional named clause", async () => {
    const err = declaredErr();
    const { result, value } = run(
      err,
      [capture({ errorName: "NoExplorer", captures: ["chain"] }, "refusal")],
      { declared: UNION },
    );
    await result;
    expect(String(value("$chain"))).toBe("100");
  });

  it("is accepted by a required named clause", async () => {
    const err = declaredErr();
    const { result, value } = run(
      err,
      [
        capture(
          {
            errorName: "NoExplorer",
            optional: false,
            captures: ["chain"],
          },
          "refusal",
        ),
      ],
      { declared: UNION },
    );
    await result;
    expect(String(value("$chain"))).toBe("100");
  });

  it("is accepted through the interpreter's helper wrapper", async () => {
    const wrapper = new ErrorException("an error occurred");
    wrapper.cause = declaredErr();
    const { result, value } = run(
      wrapper,
      [capture({ errorName: "NoExplorer", boolVar: "missing" }, "refusal")],
      { declared: UNION },
    );
    await result;
    expect(value("$missing")).toBe("true");
  });

  it("is accepted by a required generic clause", async () => {
    const err = declaredErr();
    const { result, value } = run(
      err,
      [capture({ optional: false, boolVar: "failed" }, "refusal")],
      { declared: UNION },
    );
    await result;
    expect(value("$failed")).toBe("true");
  });
});

describe("captureListRequiresFailure", () => {
  it("is false for an empty or all-optional list", () => {
    expect(captureListRequiresFailure([])).toBe(false);
    expect(
      captureListRequiresFailure([
        capture({ boolVar: "a" }),
        capture({ errorName: "SameToken" }),
      ]),
    ).toBe(false);
  });

  it("is true as soon as one clause is required", () => {
    expect(
      captureListRequiresFailure([
        capture({ boolVar: "a" }),
        capture({ errorName: "SameToken", optional: false }),
      ]),
    ).toBe(true);
  });
});

describe("selectCaptureErrorAbis", () => {
  it("returns nothing for a generic clause", () => {
    expect(selectCaptureErrorAbis(capture({}), { declared: UNION })).toEqual(
      [],
    );
  });

  it("returns the declared item for a bare declared name", () => {
    const [item] = selectCaptureErrorAbis(
      capture({ errorName: "BelowMinimum" }, "refusal"),
      { declared: COMMAND_ONLY },
    );
    expect(item?.inputs.map((i) => i.type)).toEqual(["uint256", "address"]);
  });

  it("returns every contract overload for a bare contract name", () => {
    const abi = parseAbi(["error Dup()", "error Dup(uint256)"]) as Abi;
    expect(
      selectCaptureErrorAbis(capture({ errorName: "Dup" }), { abi }).length,
    ).toBe(2);
  });

  it("returns nothing for an unavailable bare name", () => {
    expect(selectCaptureErrorAbis(capture({ errorName: "Nope" }), {})).toEqual(
      [],
    );
  });

  it("ignores the contract ABI for a refusal clause", () => {
    const abi = parseAbi(["error Dup()", "error Dup(uint256)"]) as Abi;
    expect(
      selectCaptureErrorAbis(capture({ errorName: "Dup" }, "refusal"), {
        abi,
        declared: COMMAND_ONLY,
      }),
    ).toEqual([]);
  });

  it("ignores the builtins for a refusal clause", () => {
    expect(
      selectCaptureErrorAbis(capture({ errorName: "Error" }, "refusal"), {
        declared: COMMAND_ONLY,
      }),
    ).toEqual([]);
  });

  it("ignores declarations for a revert clause", () => {
    expect(
      selectCaptureErrorAbis(capture({ errorName: "BelowMinimum" }), {
        declared: COMMAND_ONLY,
      }),
    ).toEqual([]);
  });

  it("builds an inline signature for either timing", () => {
    const params = { errorName: "Error", errorParams: ["string"] };
    for (const timing of ["refusal", "revert"] as const) {
      const [item] = selectCaptureErrorAbis(capture(params, timing), {});
      expect(item?.name).toBe("Error");
      expect(item?.inputs.map((i) => i.type)).toEqual(["string"]);
    }
  });

  it("throws on an ambiguous declared name for a refusal clause only", () => {
    expect(() =>
      selectCaptureErrorAbis(capture({ errorName: "Shared" }, "refusal"), {
        declared: UNION,
      }),
    ).toThrow(/more than one signature/);
    expect(
      selectCaptureErrorAbis(capture({ errorName: "Shared" }), {
        declared: UNION,
      }),
    ).toEqual([]);
  });
});

describe("failureTiming", () => {
  it("reads a chain revert as a revert", () => {
    expect(failureTiming(new RevertError("Transaction reverted"))).toBe(
      "revert",
    );
  });

  it("reads a wrapped chain revert as a revert", () => {
    const wrapper = new ErrorException("an error occurred");
    wrapper.cause = new RevertError("Transaction reverted");
    expect(failureTiming(wrapper)).toBe("revert");
  });

  it("reads a declared error as a refusal, despite its revertData", () => {
    const err = raised(() => commandFail("SameToken", {}, "same token"));
    expect(failureTiming(err)).toBe("refusal");
  });

  it("reads an ordinary exception and a non-error value as a refusal", () => {
    expect(failureTiming(new ErrorException("encoding failed"))).toBe(
      "refusal",
    );
    expect(failureTiming({ nope: true })).toBe("refusal");
  });
});

// The interpreter decides which family a failure is routed to: a revert
// clause refuses anything that did not come from the chain, while a
// refusal clause takes whatever it is handed — including a read that
// reverted while the line's arguments were being evaluated.
describe("resolveErrorCaptures — timing", () => {
  const sameTokenRevert = () =>
    new RevertError(
      "Transaction reverted",
      encodeErrorResult({
        abi: parseAbi(["error SameToken()"]),
        errorName: "SameToken",
      }),
    );
  const reasonRevert = () =>
    new RevertError(
      "Transaction reverted",
      encodeErrorResult({
        abi: ERROR_STRING_ABI,
        errorName: "Error",
        args: ["nope"],
      }),
    );

  it("matches a declared refusal with a refusal clause", async () => {
    const err = raised(() => commandFail("SameToken", {}, "same token"));
    const { result, value } = run(
      err,
      [capture({ errorName: "SameToken", boolVar: "same" }, "refusal")],
      { declared: COMMAND_ONLY },
    );
    await result;
    expect(value("$same")).toBe("true");
  });

  it("does not match a declared refusal with a revert clause", async () => {
    const err = raised(() => commandFail("SameToken", {}, "same token"));
    const { result } = run(
      err,
      [capture({ errorName: "SameToken", boolVar: "same" })],
      { declared: COMMAND_ONLY, abi: parseAbi(["error SameToken()"]) as Abi },
    );
    expect(await caught(result)).toBe(err);
  });

  it("matches a reason-string revert with a revert clause", async () => {
    const err = reasonRevert();
    const { result, value } = run(err, [
      capture({
        errorName: "Error",
        errorParams: ["string"],
        captures: ["why"],
      }),
    ]);
    await result;
    expect(value("$why")).toBe("nope");
  });

  it("matches a pre-send read revert with an inline refusal clause", async () => {
    // A view call that reverted while the line's arguments were evaluated:
    // the line never sent anything, so it is the refusal family's failure.
    const err = reasonRevert();
    const { result, value } = run(err, [
      capture(
        { errorName: "Error", errorParams: ["string"], captures: ["why"] },
        "refusal",
      ),
    ]);
    await result;
    expect(value("$why")).toBe("nope");
  });

  it("matches a pre-send read revert whose selector equals a declared name", async () => {
    const err = sameTokenRevert();
    const { result, value } = run(
      err,
      [capture({ errorName: "SameToken", boolVar: "same" }, "refusal")],
      { declared: COMMAND_ONLY },
    );
    await result;
    expect(value("$same")).toBe("true");
  });

  it("still resolves a refusal name in the declared union alone", async () => {
    // `Dup` is only in the contract ABI, so the refusal clause has nothing
    // to decode with even though the payload would match.
    const abi = parseAbi(["error Dup()"]) as Abi;
    const err = new RevertError(
      "Transaction reverted",
      encodeErrorResult({ abi, errorName: "Dup" }),
    );
    const { result } = run(
      err,
      [capture({ errorName: "Dup", boolVar: "dup" }, "refusal")],
      { abi, declared: COMMAND_ONLY },
    );
    expect(await caught(result)).toBe(err);
  });

  it("binds a declared refusal's message to a generic refusal clause", async () => {
    const err = raised(() => commandFail("SameToken", {}, "same token"));
    const { result, value } = run(
      err,
      [capture({ captures: ["reason"] }, "refusal")],
      { declared: COMMAND_ONLY },
    );
    await result;
    expect(value("$reason")).toBe("same token");
  });

  it("binds a plain exception's message to a generic refusal clause", async () => {
    const err = new ErrorException("no explorer for gnosis");
    const { result, value } = run(err, [
      capture({ captures: ["reason"] }, "refusal"),
    ]);
    await result;
    expect(value("$reason")).toBe("no explorer for gnosis");
  });

  it("binds a pre-send read revert's decoded reason to a generic refusal clause", async () => {
    const { result, value } = run(reasonRevert(), [
      capture({ captures: ["reason"] }, "refusal"),
    ]);
    await result;
    expect(value("$reason")).toBe("nope");
  });

  it("binds a revert's decoded reason to a generic revert clause", async () => {
    const { result, value } = run(reasonRevert(), [
      capture({ captures: ["reason"] }),
    ]);
    await result;
    expect(value("$reason")).toBe("nope");
  });

  it("leaves a declared refusal to a generic revert clause untouched", async () => {
    const err = raised(() =>
      helperFail("NoExplorer", { chainId: 100n }, "no explorer for gnosis"),
    );
    const { result, value } = run(err, [capture({ captures: ["reason"] })], {
      declared: UNION,
    });
    expect(await caught(result)).toBe(err);
    expect(value("$reason")).toBeUndefined();
  });

  it("does not match a generic revert clause against a plain exception", async () => {
    const err = new ErrorException("encoding failed");
    const { result } = run(err, [capture({ boolVar: "failed" })]);
    expect(await caught(result)).toBe(err);
  });
});

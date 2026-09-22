import { describe, expect, it } from "bun:test";
import { createFail, defineErrors } from "@evmcrispr/sdk";

import {
  declaredErrorNames,
  describeCommand,
  describeHelper,
  expectDeclaredError,
  expectDeclaredFailure,
  missingDeclaredErrorCases,
} from "../src/evml/testing";

const ERRORS = defineErrors({
  SameToken: { description: "The sell and buy token are the same" },
  BelowMinimum: {
    description: "A part is worth less than the minimum order value",
    fields: [
      { name: "minimum", type: "number", description: "Minimum per part" },
      { name: "funder", type: "address", description: "Account charged" },
    ],
  },
});

const fail = createFail(ERRORS, 'command "twap"');

/** The refusal a declaring command raises, as tests see it. */
function raise(): unknown {
  try {
    fail(
      "BelowMinimum",
      {
        minimum: 1000n,
        funder: "0x1234567890AbcdEF1234567890aBcdef12345678",
      },
      "each part is worth less than 0.001 USDC",
    );
  } catch (err) {
    return err;
  }
  throw new Error("fail() did not throw");
}

/** The interpreter wraps a helper refusal; the expectation walks causes. */
function wrapped(depth: number): unknown {
  let error = raise();
  for (let i = 0; i < depth; i++) {
    error = new Error(`wrapper ${i}`, { cause: error });
  }
  return error;
}

describe("Test utils > declared error expectations", () => {
  describe("expectDeclaredError", () => {
    it("accepts a matching name and returns the declared error", () => {
      const declared = expectDeclaredError(raise(), { name: "BelowMinimum" });
      expect(declared.errorName).toBe("BelowMinimum");
      expect(declared.message).toBe("each part is worth less than 0.001 USDC");
    });

    it("finds the declared error through wrapper causes", () => {
      const declared = expectDeclaredError(wrapped(3), {
        name: "BelowMinimum",
      });
      expect(declared.errorName).toBe("BelowMinimum");
    });

    it("checks the fields it is given", () => {
      expectDeclaredError(raise(), {
        name: "BelowMinimum",
        fields: { minimum: 1000n },
      });
    });

    it("accepts a safe integer for a uint256 field", () => {
      expectDeclaredError(raise(), {
        name: "BelowMinimum",
        fields: { minimum: 1000 },
      });
    });

    it("compares addresses regardless of checksum casing", () => {
      expectDeclaredError(raise(), {
        name: "BelowMinimum",
        fields: { funder: "0x1234567890abcdef1234567890abcdef12345678" },
      });
    });

    it("ignores fields the expectation does not mention", () => {
      expectDeclaredError(raise(), {
        name: "BelowMinimum",
        fields: { funder: "0x1234567890AbcdEF1234567890aBcdef12345678" },
      });
    });

    it("rejects a different declared name", () => {
      expect(() => expectDeclaredError(raise(), { name: "SameToken" })).toThrow(
        /Expected declared error "SameToken".*got "BelowMinimum"/s,
      );
    });

    it("rejects a wrong field value", () => {
      expect(() =>
        expectDeclaredError(raise(), {
          name: "BelowMinimum",
          fields: { minimum: 999n },
        }),
      ).toThrow(/field "minimum".*999.*1000/s);
    });

    it("rejects an unknown field name", () => {
      expect(() =>
        expectDeclaredError(raise(), {
          name: "BelowMinimum",
          fields: { maximum: 1n },
        }),
      ).toThrow(/no field "maximum"/);
    });

    it("rejects an ordinary failure", () => {
      expect(() =>
        expectDeclaredError(new Error("not enough tokens"), {
          name: "BelowMinimum",
        }),
      ).toThrow(/no declared error.*not enough tokens/s);
    });
  });

  describe("expectDeclaredFailure", () => {
    const refuse = () => Promise.reject(raise());

    it("accepts a run that raises the declared error", async () => {
      const declared = await expectDeclaredFailure(
        refuse,
        { name: "BelowMinimum", fields: { minimum: 1000n } },
        "swaps:twap",
      );
      expect(declared.errorName).toBe("BelowMinimum");
    });

    it("also matches the raise-site message when one is given", async () => {
      await expectDeclaredFailure(
        refuse,
        { name: "BelowMinimum" },
        "swaps:twap",
        /worth less than/,
      );
      await expect(
        expectDeclaredFailure(
          refuse,
          { name: "BelowMinimum" },
          "swaps:twap",
          "a different message",
        ),
      ).rejects.toThrow();
    });

    it("rejects a run that succeeds", async () => {
      await expect(
        expectDeclaredFailure(
          async () => "fine",
          { name: "BelowMinimum" },
          "swaps:twap",
        ),
      ).rejects.toThrow(
        /Expected swaps:twap to fail with declared error "BelowMinimum", but it succeeded/,
      );
    });

    it("rejects a run that fails in an undeclared way", async () => {
      await expect(
        expectDeclaredFailure(
          () => Promise.reject(new Error("connection refused")),
          { name: "BelowMinimum" },
          "swaps:twap",
        ),
      ).rejects.toThrow(/no declared error.*connection refused/s);
    });
  });

  describe("declaration coverage", () => {
    it("reads the names off a definition's errors block", () => {
      expect(declaredErrorNames(ERRORS)).toEqual(["SameToken", "BelowMinimum"]);
    });

    it("reads the names off a definition", () => {
      expect(declaredErrorNames({ errors: ERRORS })).toEqual([
        "SameToken",
        "BelowMinimum",
      ]);
    });

    it("reads no names from a definition that declares nothing", () => {
      expect(declaredErrorNames({ errors: undefined })).toEqual([]);
    });

    it("refuses a value that is neither a definition nor an errors block", () => {
      expect(() => declaredErrorNames({ run: () => {} } as never)).toThrow(
        /definition or its `errors` block/,
      );
    });

    it("lists the declared names without a case", () => {
      expect(
        missingDeclaredErrorCases(ERRORS, [
          { declared: { name: "SameToken" } },
          { error: "some message" },
        ]),
      ).toEqual(["BelowMinimum"]);
    });

    it("is satisfied when every name has a case", () => {
      expect(
        missingDeclaredErrorCases(ERRORS, [
          { declared: { name: "SameToken" } },
          { declared: { name: "BelowMinimum" } },
        ]),
      ).toEqual([]);
    });
  });

  describe("registration-time checks", () => {
    it("describeCommand rejects an uncovered declared error", () => {
      expect(() =>
        describeCommand("twap", {
          module: "swaps",
          declaredErrors: ERRORS,
          errorCases: [
            {
              name: "refuses the same token",
              script: "swaps:twap ...",
              declared: { name: "SameToken" },
            },
          ],
        }),
      ).toThrow(/twap.*BelowMinimum/s);
    });

    it("describeHelper rejects an uncovered declared error", () => {
      expect(() =>
        describeHelper("@token:holdings", {
          module: "token",
          declaredErrors: ERRORS,
          errorCases: [],
        }),
      ).toThrow(/holdings.*SameToken.*BelowMinimum/s);
    });

    it("describeCommand rejects a case with no expectation at all", () => {
      expect(() =>
        describeCommand("twap", {
          module: "swaps",
          errorCases: [{ name: "refuses", script: "swaps:twap ..." } as never],
        }),
      ).toThrow(/refuses.*`error`.*`declared`/s);
    });

    it("describeHelper rejects a case with no expectation at all", () => {
      expect(() =>
        describeHelper("@token:holdings", {
          module: "token",
          errorCases: [{ input: "@token:holdings(@me)" } as never],
        }),
      ).toThrow(/`error`.*`declared`/s);
    });
  });
});

import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { SENTINEL } from "../../src/addresses";
import { findListPredecessor } from "../../src/utils/reads";

const A = "0x1111111111111111111111111111111111111111" as const;
const B = "0x2222222222222222222222222222222222222222" as const;
const C = "0x3333333333333333333333333333333333333333" as const;

describe("Safe > utils > findListPredecessor", () => {
  it("returns the sentinel for the first entry", () => {
    expect(findListPredecessor([A, B, C], A, "owner")).to.equal(SENTINEL);
  });

  it("returns the previous entry otherwise", () => {
    expect(findListPredecessor([A, B, C], C, "owner")).to.equal(B);
  });

  it("matches addresses case-insensitively", () => {
    expect(
      findListPredecessor(
        [A, B],
        B.toUpperCase().replace("0X", "0x") as any,
        "owner",
      ),
    ).to.equal(A);
  });

  it("throws when the entry is missing", () => {
    expect(() => findListPredecessor([A, B], C, "owner")).to.throw(
      "not found on the Safe",
    );
  });
});

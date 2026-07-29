import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import {
  applySlippageDown,
  applySlippageUp,
  pctToBps,
} from "../../src/utils/amounts";

describe("Swaps > utils > amounts", () => {
  describe("pctToBps", () => {
    it("converts percentages to basis points", () => {
      expect(pctToBps(0.5)).to.eq(50);
      expect(pctToBps(1)).to.eq(100);
      expect(pctToBps(0)).to.eq(0);
      expect(pctToBps(100)).to.eq(10000);
      expect(pctToBps(0.005)).to.eq(1); // rounds to nearest bp
    });

    it("rejects out-of-range values", () => {
      expect(() => pctToBps(-1)).to.throw("between 0 and 100");
      expect(() => pctToBps(101)).to.throw("between 0 and 100");
      expect(() => pctToBps(Number.NaN)).to.throw("between 0 and 100");
    });
  });

  describe("applySlippageDown", () => {
    it("lowers an amount by the tolerance, rounding down", () => {
      expect(applySlippageDown(10000n, 50)).to.eq(9950n);
      expect(applySlippageDown(3n, 50)).to.eq(2n); // 2.985 floors to 2
      expect(applySlippageDown(10000n, 0)).to.eq(10000n);
      expect(applySlippageDown(10000n, 10000)).to.eq(0n);
    });
  });

  describe("applySlippageUp", () => {
    it("raises an amount by the tolerance, rounding up", () => {
      expect(applySlippageUp(10000n, 50)).to.eq(10050n);
      expect(applySlippageUp(3n, 50)).to.eq(4n); // 3.015 ceils to 4
      expect(applySlippageUp(10000n, 0)).to.eq(10000n);
    });
  });
});

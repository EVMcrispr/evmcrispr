import { describe, it } from "bun:test";
import { Num } from "@evmcrispr/sdk";
import { expect } from "chai";

describe("Num", () => {
  describe("construction", () => {
    it("should create from two bigints and simplify via GCD", () => {
      const n = new Num(6n, 4n);
      expect(n.num).to.equal(3n);
      expect(n.den).to.equal(2n);
    });

    it("should normalize negative denominator", () => {
      const n = new Num(3n, -2n);
      expect(n.num).to.equal(-3n);
      expect(n.den).to.equal(2n);
    });

    it("should throw on zero denominator", () => {
      expect(() => new Num(1n, 0n)).to.throw("Division by zero");
    });
  });

  describe("fromBigInt", () => {
    it("should create integer with den=1", () => {
      const n = Num.fromBigInt(42n);
      expect(n.num).to.equal(42n);
      expect(n.den).to.equal(1n);
    });
  });

  describe("fromDecimalString", () => {
    it("should parse integer strings", () => {
      const n = Num.fromDecimalString("42");
      expect(n.num).to.equal(42n);
      expect(n.den).to.equal(1n);
    });

    it("should parse decimal strings", () => {
      const n = Num.fromDecimalString("0.5");
      expect(n.num).to.equal(1n);
      expect(n.den).to.equal(2n);
    });

    it("should parse and simplify", () => {
      const n = Num.fromDecimalString("1.25");
      expect(n.num).to.equal(5n);
      expect(n.den).to.equal(4n);
    });

    it("should handle many decimal places", () => {
      const n = Num.fromDecimalString("0.000001");
      expect(n.num).to.equal(1n);
      expect(n.den).to.equal(1000000n);
    });
  });

  describe("coerce", () => {
    it("should pass through Num", () => {
      const n = new Num(3n, 2n);
      expect(Num.coerce(n)).to.equal(n);
    });

    it("should coerce bigint", () => {
      const n = Num.coerce(5n);
      expect(n.num).to.equal(5n);
      expect(n.den).to.equal(1n);
    });

    it("should coerce integer string", () => {
      const n = Num.coerce("123");
      expect(n.num).to.equal(123n);
      expect(n.den).to.equal(1n);
    });

    it("should coerce decimal string", () => {
      const n = Num.coerce("0.75");
      expect(n.num).to.equal(3n);
      expect(n.den).to.equal(4n);
    });

    it("should throw for non-numeric types", () => {
      expect(() => Num.coerce(true)).to.throw();
    });
  });

  describe("arithmetic", () => {
    const a = new Num(3n, 2n); // 1.5
    const b = new Num(1n, 3n); // 1/3

    it("should add correctly", () => {
      const r = a.add(b); // 3/2 + 1/3 = 11/6
      expect(r.num).to.equal(11n);
      expect(r.den).to.equal(6n);
    });

    it("should subtract correctly", () => {
      const r = a.sub(b); // 3/2 - 1/3 = 7/6
      expect(r.num).to.equal(7n);
      expect(r.den).to.equal(6n);
    });

    it("should multiply correctly", () => {
      const r = a.mul(b); // 3/2 * 1/3 = 1/2
      expect(r.num).to.equal(1n);
      expect(r.den).to.equal(2n);
    });

    it("should divide correctly", () => {
      const r = a.div(b); // (3/2) / (1/3) = 9/2
      expect(r.num).to.equal(9n);
      expect(r.den).to.equal(2n);
    });

    it("should throw on divide by zero", () => {
      const zero = Num.fromBigInt(0n);
      expect(() => a.div(zero)).to.throw("Division by zero");
    });

    it("should exponentiate correctly", () => {
      const r = a.pow(Num.fromBigInt(3n)); // (3/2)^3 = 27/8
      expect(r.num).to.equal(27n);
      expect(r.den).to.equal(8n);
    });

    it("should handle negative exponents", () => {
      const r = Num.fromBigInt(2n).pow(new Num(-1n, 1n)); // 2^(-1) = 1/2
      expect(r.num).to.equal(1n);
      expect(r.den).to.equal(2n);
    });

    it("should throw on non-integer exponent", () => {
      expect(() => a.pow(new Num(1n, 2n))).to.throw(
        "Exponent must be an integer",
      );
    });

    it("should give exact result for 1/3 * 3", () => {
      const third = Num.fromBigInt(1n).div(Num.fromBigInt(3n));
      const r = third.mul(Num.fromBigInt(3n));
      expect(r.num).to.equal(1n);
      expect(r.den).to.equal(1n);
    });

    it("should give exact result for 3/2", () => {
      const r = Num.fromBigInt(3n).div(Num.fromBigInt(2n));
      expect(r.num).to.equal(3n);
      expect(r.den).to.equal(2n);
    });
  });

  describe("comparison", () => {
    it("should compare equal values", () => {
      const a = new Num(1n, 2n);
      const b = new Num(2n, 4n);
      expect(a.eq(b)).to.be.true;
      expect(a.compare(b)).to.equal(0);
    });

    it("should compare greater than", () => {
      const a = new Num(3n, 2n);
      const b = Num.fromBigInt(1n);
      expect(a.gt(b)).to.be.true;
      expect(a.gte(b)).to.be.true;
      expect(a.lt(b)).to.be.false;
      expect(a.compare(b)).to.equal(1);
    });

    it("should compare less than", () => {
      const a = new Num(1n, 3n);
      const b = Num.fromBigInt(1n);
      expect(a.lt(b)).to.be.true;
      expect(a.lte(b)).to.be.true;
      expect(a.gt(b)).to.be.false;
      expect(a.compare(b)).to.equal(-1);
    });
  });

  describe("conversion", () => {
    it("should truncate toward zero for toBigInt", () => {
      expect(new Num(7n, 2n).toBigInt()).to.equal(3n); // 3.5 → 3
      expect(new Num(-7n, 2n).toBigInt()).to.equal(-3n); // -3.5 → -3
    });

    it("toString should return decimal string", () => {
      expect(new Num(7n, 2n).toString()).to.equal("3.5");
    });

    it("toFractionString should return num/den", () => {
      expect(new Num(3n, 2n).toFractionString()).to.equal("3/2");
    });

    it("isInteger should detect whole numbers", () => {
      expect(Num.fromBigInt(5n).isInteger()).to.be.true;
      expect(new Num(3n, 2n).isInteger()).to.be.false;
    });

    it("BigInt() coercion should work via toBigInt()", () => {
      const n = new Num(7n, 2n); // 3.5
      expect(BigInt(n.toBigInt())).to.equal(3n);
    });
  });
});

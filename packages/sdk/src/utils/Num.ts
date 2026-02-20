import { formatUnits } from "viem";

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b > 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

export class Num {
  readonly num: bigint;
  readonly den: bigint;

  constructor(num: bigint, den: bigint) {
    if (den === 0n) {
      throw new Error("Division by zero");
    }
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = gcd(num < 0n ? -num : num, den);
    this.num = num / g;
    this.den = den / g;
  }

  static fromBigInt(n: bigint): Num {
    return new Num(n, 1n);
  }

  static fromDecimalString(s: string): Num {
    const dotIndex = s.indexOf(".");
    if (dotIndex === -1) {
      return new Num(BigInt(s), 1n);
    }
    const decimals = s.length - dotIndex - 1;
    const withoutDot = s.slice(0, dotIndex) + s.slice(dotIndex + 1);
    return new Num(BigInt(withoutDot), 10n ** BigInt(decimals));
  }

  static coerce(v: unknown): Num {
    if (v instanceof Num) {
      return v;
    }
    if (typeof v === "bigint") {
      return Num.fromBigInt(v);
    }
    if (typeof v === "string") {
      if (v.includes(".")) {
        return Num.fromDecimalString(v);
      }
      return new Num(BigInt(v), 1n);
    }
    throw new Error(`Cannot coerce ${typeof v} to Num`);
  }

  add(other: Num): Num {
    return new Num(
      this.num * other.den + other.num * this.den,
      this.den * other.den,
    );
  }

  sub(other: Num): Num {
    return new Num(
      this.num * other.den - other.num * this.den,
      this.den * other.den,
    );
  }

  mul(other: Num): Num {
    return new Num(this.num * other.num, this.den * other.den);
  }

  div(other: Num): Num {
    if (other.num === 0n) {
      throw new Error("Division by zero");
    }
    return new Num(this.num * other.den, this.den * other.num);
  }

  pow(exp: Num): Num {
    if (exp.den !== 1n) {
      throw new Error("Exponent must be an integer");
    }

    const n = exp.num;

    if (n < 0n) {
      const posExp = -n;
      return new Num(this.den ** posExp, this.num ** posExp);
    }

    return new Num(this.num ** n, this.den ** n);
  }

  compare(other: Num): -1 | 0 | 1 {
    const lhs = this.num * other.den;
    const rhs = other.num * this.den;
    if (lhs < rhs) return -1;
    if (lhs > rhs) return 1;
    return 0;
  }

  eq(other: Num): boolean {
    return this.num === other.num && this.den === other.den;
  }

  gt(other: Num): boolean {
    return this.num * other.den > other.num * this.den;
  }

  gte(other: Num): boolean {
    return this.num * other.den >= other.num * this.den;
  }

  lt(other: Num): boolean {
    return this.num * other.den < other.num * this.den;
  }

  lte(other: Num): boolean {
    return this.num * other.den <= other.num * this.den;
  }

  isInteger(): boolean {
    return this.den === 1n;
  }

  toBigInt(): bigint {
    return this.num / this.den;
  }

  toString(): string {
    return formatUnits((this.num * BigInt(10 ** 18)) / this.den, 18);
  }

  toFractionString(): string {
    return `${this.num}/${this.den}`;
  }
}

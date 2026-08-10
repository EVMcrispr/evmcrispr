import { formatUnits } from "viem";

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b > 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

class _Num {
  readonly num: bigint;
  readonly den: bigint;

  constructor(num: bigint, den: bigint = 1n) {
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

  add(other: Num): Num {
    return new _Num(
      this.num * other.den + other.num * this.den,
      this.den * other.den,
    );
  }

  sub(other: Num): Num {
    return new _Num(
      this.num * other.den - other.num * this.den,
      this.den * other.den,
    );
  }

  mul(other: Num): Num {
    return new _Num(this.num * other.num, this.den * other.den);
  }

  div(other: Num): Num {
    if (other.num === 0n) {
      throw new Error("Division by zero");
    }
    return new _Num(this.num * other.den, this.den * other.num);
  }

  pow(exp: Num): Num {
    if (exp.den !== 1n) {
      throw new Error("Exponent must be an integer");
    }

    const n = exp.num;

    if (n < 0n) {
      const posExp = -n;
      return new _Num(this.den ** posExp, this.num ** posExp);
    }

    return new _Num(this.num ** n, this.den ** n);
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

  /** Truncation TOWARD ZERO (bigint division), not a floor: -1.9 gives -1.
   *  Use {@link floorBigInt}/{@link ceilBigInt} when the rounding direction
   *  has to be exact for negatives. */
  toBigInt(): bigint {
    return this.num / this.den;
  }

  /** The greatest integer <= this value (den is always positive after
   *  normalization, so only a negative numerator rounds away from zero). */
  floorBigInt(): bigint {
    const q = this.num / this.den;
    return this.num < 0n && q * this.den !== this.num ? q - 1n : q;
  }

  /** The least integer >= this value. */
  ceilBigInt(): bigint {
    const q = this.num / this.den;
    return this.num > 0n && q * this.den !== this.num ? q + 1n : q;
  }

  toNumber(): number {
    return Number(this.num) / Number(this.den);
  }

  toString(): string {
    return formatUnits((this.num * BigInt(10 ** 18)) / this.den, 18);
  }

  toFractionString(): string {
    return `${this.num}/${this.den}`;
  }
}

interface Num extends _Num {}

interface NumFactory {
  (num: bigint, den?: bigint): Num;
  (v: Num | bigint | string): Num;
  (v: unknown): Num;
  fromBigInt(n: bigint): Num;
  fromDecimalString(s: string): Num;
  prototype: _Num;
}

function _parseDecimalString(s: string): Num {
  const dotIndex = s.indexOf(".");
  if (dotIndex === -1) {
    return new _Num(BigInt(s), 1n);
  }
  const decimals = s.length - dotIndex - 1;
  const withoutDot = s.slice(0, dotIndex) + s.slice(dotIndex + 1);
  return new _Num(BigInt(withoutDot), 10n ** BigInt(decimals));
}

function _Num_factory(v: unknown, den?: bigint): Num {
  if (v instanceof _Num && den === undefined) return v;
  if (typeof v === "bigint") return new _Num(v, den);
  if (typeof v === "string") return _parseDecimalString(v);
  throw new Error(`Cannot coerce ${typeof v} to Num`);
}

_Num_factory.fromBigInt = (n: bigint): Num => new _Num(n, 1n);
_Num_factory.fromDecimalString = _parseDecimalString;
_Num_factory.prototype = _Num.prototype;

Object.defineProperty(_Num_factory, Symbol.hasInstance, {
  value: (v: unknown) => v instanceof _Num,
});

const Num: NumFactory = _Num_factory as NumFactory;

export { Num };

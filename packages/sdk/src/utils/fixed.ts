import { ErrorException } from "@evmcrispr/sdk";

/**
 * Off-chain mirrors of the Operators fixed-point functions.
 *
 * These are ports, not reimplementations: the on-chain versions are pure
 * integer algorithms, so the same steps in bigint produce the same words,
 * and a plain `@pow` agrees with `@pow!` to the last unit. Where the
 * Solidity relies on `unchecked` wrapping, asIntN/asUintN reproduce it —
 * bigint would otherwise keep growing and silently diverge.
 */

const MAX_UINT256 = (1n << 256n) - 1n;

/** Wrap to int256, the way an `unchecked` Solidity block does. */
const asInt = (v: bigint): bigint => BigInt.asIntN(256, v);
/** Reinterpret an int256 as uint256, for the unsigned shifts. */
const asUint = (v: bigint): bigint => BigInt.asUintN(256, v);

/** floor(a * b / d) with an exact intermediate, mirroring mulDiv. */
function mulDiv(a: bigint, b: bigint, d: bigint): bigint {
  if (d === 0n) throw new ErrorException("division by zero");
  const result = (a * b) / d;
  if (result > MAX_UINT256) {
    throw new ErrorException("fixed-point result overflows 256 bits");
  }
  return result;
}

/**
 * x^n in fixed point where `base` is one unit — binary exponentiation
 * with the scale divided out after each multiply, rounding down at every
 * step exactly as the contract does.
 */
export function rpow(x: bigint, n: bigint, base: bigint): bigint {
  if (base === 0n) throw new ErrorException("@pow needs a non-zero base");
  if (x < 0n || n < 0n)
    throw new ErrorException("@pow needs unsigned operands");
  if (x === 0n) return n === 0n ? base : 0n;
  let result = base;
  let acc = x;
  let e = n;
  while (e > 0n) {
    if (e & 1n) result = mulDiv(result, acc, base);
    e >>= 1n;
    if (e > 0n) acc = mulDiv(acc, acc, base);
  }
  return result;
}

/** floor(log2(x)); the logarithm is undefined at zero. */
export function log2(x: bigint): bigint {
  if (x <= 0n) throw new ErrorException("@log2 is undefined at zero");
  let r = 0n;
  let v = x;
  for (const shift of [128n, 64n, 32n, 16n, 8n, 4n, 2n, 1n]) {
    if (v >= 1n << shift) {
      v >>= shift;
      r += shift;
    }
  }
  return r;
}

/** e^x in wad (1e18) fixed point. */
export function expWad(x: bigint): bigint {
  if (x <= -42139678854452767551n) return 0n;
  if (x >= 135305999368893231589n) {
    throw new ErrorException("@exp overflows the wad range above ~135.3");
  }

  let v = asInt((x << 78n) / 5n ** 18n);

  const k = asInt(
    ((v << 96n) / 54916777467707473351141471128n + 2n ** 95n) >> 96n,
  );
  v = asInt(v - k * 54916777467707473351141471128n);

  let y = asInt(v + 1346386616545796478920950773328n);
  y = asInt(((y * v) >> 96n) + 57155421227552351082224309758442n);
  let p = asInt(y + v - 94201549194550492254356042504812n);
  p = asInt(((p * y) >> 96n) + 28719021644029726153956944680412240n);
  p = asInt(p * v + (4385272521454847904659076985693276n << 96n));

  let q = asInt(v - 2855989394907223263936484059900n);
  q = asInt(((q * v) >> 96n) + 50020603652535783019961831881945n);
  q = asInt(((q * v) >> 96n) - 533845033583426703283633433725380n);
  q = asInt(((q * v) >> 96n) + 3604857256930695427073651918091429n);
  q = asInt(((q * v) >> 96n) - 14423608567350463180887372962807573n);
  q = asInt(((q * v) >> 96n) + 26449188498355588339934803723976023n);

  const r = p / q;
  return asInt(
    (asUint(r) * 3822833074963236453042738258902158003155416615667n) >>
      (195n - k),
  );
}

/** The natural log of x in wad (1e18) fixed point. */
export function lnWad(x: bigint): bigint {
  if (x <= 0n) throw new ErrorException("@ln is undefined at or below zero");

  const k = log2(asUint(x)) - 96n;
  // The shift overflows int256 on purpose: only the low bits matter, and
  // the unsigned shift back takes them.
  const v = asInt(asUint(asInt(x << (159n - k))) >> 159n);

  let p = asInt(v + 3273285459638523848632254066296n);
  p = asInt(((p * v) >> 96n) + 24828157081833163892658089445524n);
  p = asInt(((p * v) >> 96n) + 43456485725739037958740375743393n);
  p = asInt(((p * v) >> 96n) - 11111509109440967052023855526967n);
  p = asInt(((p * v) >> 96n) - 45023709667254063763336534515857n);
  p = asInt(((p * v) >> 96n) - 14706773417378608786704636184526n);
  p = asInt(p * v - (795164235651350426258249787498n << 96n));

  let q = asInt(v + 5573035233440673466300451813936n);
  q = asInt(((q * v) >> 96n) + 71694874799317883764090561454958n);
  q = asInt(((q * v) >> 96n) + 283447036172924575727196451306956n);
  q = asInt(((q * v) >> 96n) + 401686690394027663651624208769553n);
  q = asInt(((q * v) >> 96n) + 204048457590392012362485061816622n);
  q = asInt(((q * v) >> 96n) + 31853899698501571402653359427138n);
  q = asInt(((q * v) >> 96n) + 909429971244387300277376558375n);

  let r = asInt(p / q);
  r = asInt(r * 1677202110996718588342820967067443963516166n);
  r = asInt(
    r +
      16597577552685614221487285958193947469193820559219878177908093499208371n *
        k,
  );
  r = asInt(
    r +
      600920179829731861736702779321621459595472258049074101567377883020018308n,
  );
  return asInt(r >> 174n);
}

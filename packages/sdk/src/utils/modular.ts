import { ErrorException } from "../errors";

/** Inverse of a nonnegative magnitude, represented in [0, modulus). */
function inverseMagnitude(value: bigint, modulus: bigint): bigint {
  let r = modulus;
  let nextR = value % modulus;
  let t = 0n;
  let nextT = 1n;
  while (nextR !== 0n) {
    const q = r / nextR;
    [r, nextR] = [nextR, r % nextR];
    [t, nextT] = [nextT, t - q * nextT];
  }
  if (r !== 1n)
    throw new ErrorException(
      "Modular inverse does not exist: base and modulus must be coprime",
    );
  return ((t % modulus) + modulus) % modulus;
}

/** Integer modular powers, with inversion for negative exponents.
 * Signed residues follow the base's sign for odd exponents; the modulus's
 * sign is ignored, consistently with integer remainder elsewhere in the DSL.
 * No word-size checks here: num permits arbitrary-precision intermediates.
 */
export function modularPower(
  base: bigint,
  exponent: bigint,
  modulus: bigint,
): bigint {
  const m = modulus < 0n ? -modulus : modulus;
  if (m === 0n) throw new ErrorException("Division by zero");
  let b = base < 0n ? -base : base;
  let e = exponent < 0n ? -exponent : exponent;
  b = exponent < 0n ? inverseMagnitude(b, m) : b % m;
  let result = 1n % m;
  while (e !== 0n) {
    if (e & 1n) result = (result * b) % m;
    e >>= 1n;
    if (e !== 0n) b = (b * b) % m;
  }
  return base < 0n && (exponent & 1n) !== 0n ? -result : result;
}

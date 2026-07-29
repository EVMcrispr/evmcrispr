export const SECONDS_PER_YEAR = 31_536_000;

/** Render a decimal fraction with up to 8 decimals, trimming zeros. */
export function formatFraction(x: number): string {
  if (x === 0) return "0";
  return x
    .toFixed(8)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

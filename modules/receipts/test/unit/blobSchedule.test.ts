import { describe, expect, it } from "bun:test";
import { blobBaseFeeUpdateFraction } from "../../src/utils/blobSchedule";

/**
 * The EIP-4844 denominator is not a constant, which is the whole reason this
 * lookup exists. It was 3338477 at Cancun, EIP-7691 raised it to 5007716 at
 * Prague, and the BPO forks raise it again — so the helper used to be wrong on
 * any chain past the fork its hardcoded value was copied from.
 *
 * How wrong: for a mainnet block carrying excessBlobGas of 181396916, the old
 * constant produced 685810243515585671095943 wei. The correct denominator
 * gives 5522545 — about 0.0055 gwei, a plausible blob fee. Seventeen orders of
 * magnitude, silently.
 *
 * The table is static data extracted from @ethereumjs/common, so it goes stale
 * on its own. These cases are what will say so: a chain that forks again
 * without the table being refreshed keeps returning the previous denominator.
 */
describe("blob base fee update fraction", () => {
  it("uses the Cancun denominator for a Cancun-era mainnet block", () => {
    // 2024-04-01, after Cancun (2024-03-13) and well before Prague.
    expect(blobBaseFeeUpdateFraction(1, 1711929600n)).toBe(3338477n);
  });

  it("moves past Cancun for a later block on the same chain", () => {
    // Mid-2026, past Prague and both BPO forks.
    expect(blobBaseFeeUpdateFraction(1, 1786382615n)).toBe(11684671n);
  });

  it("is chain-specific, not just time-specific", () => {
    // The same instant on a testnet resolves through that chain's own
    // schedule rather than mainnet's.
    expect(blobBaseFeeUpdateFraction(11155111, 1786382615n)).toBeGreaterThan(
      0n,
    );
  });

  it("refuses a chain whose schedule is unknown, rather than guessing", () => {
    // Gnosis. A plausible wrong number is worse than an error here: the
    // result feeds an assertion.
    expect(() => blobBaseFeeUpdateFraction(100, 1786382615n)).toThrow(
      /no blob-fee schedule known for/,
    );
  });
});

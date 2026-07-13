import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { rayAprToApy } from "../../src/adapters/aave-like/rates";
import { perSecondRateToApy } from "../../src/adapters/compound-v3/rates";
import { formatFraction } from "../../src/utils/rates";

const RAY = 10n ** 27n;
const SECONDS_PER_YEAR = 31_536_000;

describe("Lending > aave-like > rates", () => {
  it("converts a zero rate to zero APY", () => {
    expect(rayAprToApy(0n)).to.eq(0);
  });

  it("compounds a 5% ray APR to roughly e^0.05 - 1", () => {
    // Per-second compounding of 5% APR converges on e^0.05 - 1 ≈ 5.127%.
    const apy = rayAprToApy(RAY / 20n);
    expect(Math.abs(apy - (Math.E ** 0.05 - 1))).to.be.lessThan(1e-6);
  });

  it("survives triple-digit APRs without overflowing", () => {
    const apy = rayAprToApy(10n * RAY); // 1000% APR
    expect(Math.abs(apy - (Math.E ** 10 - 1)) / apy).to.be.lessThan(1e-4);
  });
});

describe("Lending > compound-v3 > rates", () => {
  it("converts a zero per-second rate to zero APY", () => {
    expect(perSecondRateToApy(0n)).to.eq(0);
  });

  it("compounds a per-second rate equivalent to 5% APR", () => {
    // rate = 0.05 / secondsPerYear, 1e18-scaled -> APY ≈ e^0.05 - 1.
    const rate = (5n * 10n ** 16n) / BigInt(SECONDS_PER_YEAR);
    const apy = perSecondRateToApy(rate);
    expect(Math.abs(apy - (Math.E ** 0.05 - 1))).to.be.lessThan(1e-4);
  });
});

describe("Lending > utils > formatFraction", () => {
  it("formats fractions with up to 8 decimals, trimming zeros", () => {
    expect(formatFraction(0)).to.eq("0");
    expect(formatFraction(0.5)).to.eq("0.5");
    expect(formatFraction(0.020431009)).to.eq("0.02043101");
    expect(formatFraction(0.0204310002)).to.eq("0.020431");
    expect(formatFraction(2)).to.eq("2");
  });
});

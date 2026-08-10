import { describe, it } from "bun:test";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import {
  perSecondRateToApy,
  RAY,
  rateAsNum,
  rayAprToApy,
  WAD,
} from "../../src/utils/rates";

const SECONDS_PER_YEAR = 31_536_000n;

/** The fraction a scaled rate stands for, as a float, for the
 *  approximation checks below only. */
const asFloat = (r: { value: bigint; scale: number }): number =>
  Number(r.value) / 10 ** r.scale;

describe("Lending > rates > ray APR", () => {
  it("converts a zero rate to zero APY", () => {
    expect(rayAprToApy(0n).value).to.eq(0n);
  });

  it("compounds a 5% ray APR to e^0.05 - 1, exactly and in ray", () => {
    const apy = rayAprToApy(RAY / 20n);
    expect(apy.scale).to.eq(27);
    // Integer arithmetic throughout, so this is the exact word, not a
    // float that happens to round here.
    expect(apy.value).to.eq(51271096334354554994858640n);
    expect(Math.abs(asFloat(apy) - (Math.E ** 0.05 - 1))).to.be.lessThan(1e-9);
  });

  it("survives triple-digit APRs without overflowing", () => {
    const apy = rayAprToApy(10n * RAY); // 1000% APR
    expect(
      Math.abs(asFloat(apy) - (Math.E ** 10 - 1)) / asFloat(apy),
    ).to.be.lessThan(1e-4);
  });
});

describe("Lending > rates > per-second wad", () => {
  it("converts a zero per-second rate to zero APY", () => {
    expect(perSecondRateToApy(0n).value).to.eq(0n);
  });

  it("compounds a per-second rate equivalent to 5% APR", () => {
    const rate = (5n * 10n ** 16n) / SECONDS_PER_YEAR;
    const apy = perSecondRateToApy(rate);
    expect(apy.scale).to.eq(18);
    expect(Math.abs(asFloat(apy) - (Math.E ** 0.05 - 1))).to.be.lessThan(1e-4);
  });

  it("keeps one wad as the unit", () => {
    expect(WAD).to.eq(10n ** 18n);
  });
});

describe("Lending > rates > rateAsNum", () => {
  it("renders a scaled rate as its exact decimal fraction", () => {
    expect(String(rateAsNum({ value: 204n * 10n ** 23n, scale: 27 }))).to.eq(
      "0.0204",
    );
    expect(String(rateAsNum({ value: 0n, scale: 27 }))).to.eq("0");
    expect(String(rateAsNum({ value: 5n * 10n ** 17n, scale: 18 }))).to.eq(
      "0.5",
    );
  });

  it("stays an exact rational rather than a rounded decimal", () => {
    // A third of a ray keeps every digit the word carries, so tripling it
    // lands just under one rather than exactly on it.
    const third = rateAsNum({ value: RAY / 3n, scale: 27 });
    expect(third.mul(Num(3n)).lt(Num(1n))).to.eq(true);
    // Every digit of the word survives: 3 * (RAY/3) is one short of RAY.
    expect(third.mul(Num(10n ** 27n)).toBigInt()).to.eq(RAY / 3n);
  });
});

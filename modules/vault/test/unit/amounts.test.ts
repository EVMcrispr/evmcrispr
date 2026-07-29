import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import {
  parseAmount,
  parseAmountOrMax,
  rejectNative,
} from "../../src/utils/amounts";
import { SDAI, ZERO_ADDRESS } from "../fixtures";

function expectThrow(fn: () => any, messagePart: string): void {
  let error: Error | null = null;
  try {
    fn();
  } catch (err: any) {
    error = err;
  }
  expect(error, "Exception not thrown").not.to.be.null;
  expect(error!.message).to.include(messagePart);
}

describe("Vault > utils > amounts", () => {
  it("passes the max sentinel through", () => {
    expect(parseAmountOrMax("max")).to.eq("max");
  });

  it("parses plain and scientific amounts to bigint", () => {
    expect(parseAmountOrMax("100")).to.eq(100n);
    expect(parseAmount("100")).to.eq(100n);
  });

  it("rejects other barewords with a clear message", () => {
    expectThrow(
      () => parseAmountOrMax("everything"),
      "must be a number or the keyword `max`",
    );
  });

  it("rejects non-positive amounts", () => {
    expectThrow(() => parseAmountOrMax("0"), "greater than zero");
    expectThrow(() => parseAmount("0"), "greater than zero");
  });

  it("rejects the zero address as a vault", () => {
    expectThrow(() => rejectNative(ZERO_ADDRESS), "native token has no vault");
  });

  it("accepts a real vault address", () => {
    rejectNative(SDAI);
  });
});

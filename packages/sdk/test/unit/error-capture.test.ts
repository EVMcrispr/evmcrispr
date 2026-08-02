import { describe, expect, it } from "bun:test";
import { encodeErrorResult, parseAbi } from "viem";

import { describeRevertData, extractRevertData, RevertError } from "../../src";

const ERROR_STRING_ABI = parseAbi(["error Error(string)"]);
const PANIC_ABI = parseAbi(["error Panic(uint256)"]);
const CUSTOM_ABI = parseAbi(["error Unauthorized(address)"]);

describe("describeRevertData", () => {
  it("returns Error(string) reasons verbatim", () => {
    const data = encodeErrorResult({
      abi: ERROR_STRING_ABI,
      errorName: "Error",
      args: ["Ownable: caller is not the owner"],
    });
    expect(describeRevertData(data)).toBe("Ownable: caller is not the owner");
  });

  it("renders known Panic codes with their solidity meaning", () => {
    // Regression: viem decodes the built-in Panic error no matter which ABI
    // is passed, so Panic data used to be mislabeled as Error(string) and
    // rendered as the bare code ("17").
    const data = encodeErrorResult({
      abi: PANIC_ABI,
      errorName: "Panic",
      args: [17n],
    });
    expect(describeRevertData(data)).toBe(
      "Panic(0x11): arithmetic overflow or underflow",
    );
  });

  it("renders unknown Panic codes without a meaning", () => {
    const data = encodeErrorResult({
      abi: PANIC_ABI,
      errorName: "Panic",
      args: [153n],
    });
    expect(describeRevertData(data)).toBe("Panic(0x99)");
  });

  it("renders custom errors as selector plus raw data", () => {
    const data = encodeErrorResult({
      abi: CUSTOM_ABI,
      errorName: "Unauthorized",
      args: ["0x000000000000000000000000000000000000dEaD"],
    });
    const selector = data.slice(0, 10);
    expect(describeRevertData(data)).toBe(
      `custom error ${selector} (data: ${data})`,
    );
  });

  it("renders a bare selector without a data suffix", () => {
    expect(describeRevertData("0x8e4a23d6")).toBe("custom error 0x8e4a23d6");
  });

  it("returns undefined for empty or missing data", () => {
    expect(describeRevertData("0x")).toBeUndefined();
    expect(describeRevertData(undefined)).toBeUndefined();
  });
});

describe("extractRevertData", () => {
  it("reads revert data straight off a RevertError", () => {
    const data = encodeErrorResult({
      abi: ERROR_STRING_ABI,
      errorName: "Error",
      args: ["nope"],
    });
    expect(
      extractRevertData(new RevertError("Transaction reverted", data)),
    ).toBe(data);
    expect(
      extractRevertData(new RevertError("Transaction reverted")),
    ).toBeUndefined();
  });
});

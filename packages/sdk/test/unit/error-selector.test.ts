import { describe, expect, it } from "bun:test";
import { decodeFunctionData } from "viem";

import {
  CORE_ABI,
  encodeIsValid,
  encodeRevertData,
  rawParam,
  toWord,
} from "../../src/onchain";
import { errorAbiFromSignature, errorSelector } from "../../src/utils";

describe("errorAbiFromSignature / errorSelector", () => {
  it("computes the selector of an inline error signature", () => {
    const abi = errorAbiFromSignature("InsufficientBalance", [
      "uint256",
      "uint256",
    ]);
    // cast keccak "InsufficientBalance(uint256,uint256)"
    expect(errorSelector(abi)).toBe("0xcf479181");
  });

  it("canonicalizes type aliases before hashing", () => {
    const aliased = errorAbiFromSignature("E", ["uint", "int"]);
    const canonical = errorAbiFromSignature("E", ["uint256", "int256"]);
    expect(errorSelector(aliased)).toBe(errorSelector(canonical));
    expect(aliased.inputs.map((i) => i.type)).toEqual(["uint256", "int256"]);
  });

  it("recognizes the Error and Panic builtins by bare name", () => {
    // cast keccak "Error(string)" / "Panic(uint256)"
    expect(errorSelector(errorAbiFromSignature("Error", undefined))).toBe(
      "0x08c379a0",
    );
    expect(errorSelector(errorAbiFromSignature("Panic", undefined))).toBe(
      "0x4e487b71",
    );
  });

  it("requires inline types for anything else", () => {
    expect(() => errorAbiFromSignature("Unauthorized", undefined)).toThrow(
      /spelled inline/,
    );
  });

  it("rejects a malformed inline signature", () => {
    expect(() => errorAbiFromSignature("Bad", ["uint9000"])).toThrow(
      /invalid inline error signature/,
    );
  });
});

describe("core encoders", () => {
  const param = rawParam(toWord(7n));

  it("encodeIsValid round-trips through the core ABI", () => {
    const { functionName, args } = decodeFunctionData({
      abi: CORE_ABI,
      data: encodeIsValid(param),
    });
    expect(functionName).toBe("isValid");
    expect((args as unknown as [{ paramData: string }])[0].paramData).toBe(
      param.paramData,
    );
  });

  it("encodeRevertData round-trips param and selector", () => {
    const { functionName, args } = decodeFunctionData({
      abi: CORE_ABI,
      data: encodeRevertData(param, "0xcf479181"),
    });
    expect(functionName).toBe("revertData");
    const [decoded, selector] = args as unknown as [
      { paramData: string },
      string,
    ];
    expect(decoded.paramData).toBe(param.paramData);
    expect(selector).toBe("0xcf479181");
  });
});

import "../../setup";
import { describeHelper, expect } from "@evmcrispr/test-utils";
import { encodeFunctionData, parseAbiItem } from "viem";
import { helpers } from "../../../src/_generated";

const addr = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";

describeHelper(
  "@abi.encodeCall",
  {
    describeName:
      "Std > helpers > @abi.encodeCall(signature, ...params)",
    cases: [
      {
        name: "should encode a transfer(address,uint256) call",
        input: `@abi.encodeCall("transfer(address,uint256)", ${addr}, 1000e18)`,
        validate: (result) => {
          const expected = encodeFunctionData({
            abi: [parseAbiItem("function transfer(address,uint256)")],
            args: [addr, 1000000000000000000000n],
          });
          expect(result).to.equal(expected);
        },
      },
      {
        name: "should encode with explicit function prefix in signature",
        input: `@abi.encodeCall("function approve(address,uint256)", ${addr}, 500e18)`,
        validate: (result) => {
          const expected = encodeFunctionData({
            abi: [parseAbiItem("function approve(address,uint256)")],
            args: [addr, 500000000000000000000n],
          });
          expect(result).to.equal(expected);
        },
      },
    ],
    errorCases: [
      {
        name: "should fail with an invalid function signature",
        input: `@abi.encodeCall("not valid(", ${addr})`,
        error: "invalid function signature",
      },
    ],
    sampleArgs: ['"transfer(address,uint256)"', addr, "1e18"],
    skipArgLengthCheck: true,
  },
  helpers["abi.encodeCall"].argDefs,
);

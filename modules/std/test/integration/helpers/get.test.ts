import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { expect } from "chai";
import { helpers } from "../../../src/_generated";

const targetAddress = "0x44fA8E6f47987339850636F88629646662444217";
const sushiFarm = "0xdDCbf776dF3dE60163066A5ddDF2277cB445E0F3";

describeHelper(
  "@get",
  {
    describeName: "Std > helpers > @get(contractAddress, method, params?)",
    cases: [
      {
        name: "should read a string return value",
        input: `@get(${targetAddress}, name()(string))`,
        expected: "Dai Stablecoin on xDai",
      },
      {
        name: "should read a tuple return value",
        input: `@get(${sushiFarm},"poolInfo(uint256)(uint128,uint64,uint64):1",1)`,
        validate: (result) => expect(result >= 1671364630n).to.be.true,
      },
      {
        name: "should read with params",
        input: `@get(${targetAddress}, balanceOf(address)(uint), ${targetAddress})`,
        validate: (result) => expect(result).not.to.be.eq("0"),
      },
    ],
    errorCases: [
      {
        name: "should fail if the method is not a valid read-abi signature",
        input: `@get(${targetAddress}, not_a_valid_function_signature)`,
        error: "read-abi signature",
      },
    ],
    sampleArgs: [targetAddress, "name()(string)"],
  },
  helpers.get.argDefs,
);

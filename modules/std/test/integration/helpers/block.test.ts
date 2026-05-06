import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@block",
  {
    cases: [
      {
        name: "should return [number, timestamp] for the latest block",
        input: "@block()",
        validate: (result) => {
          expect(result).to.be.an("array");
          expect(result).to.have.lengthOf(2);
          const [blockNum, timestamp] = result;
          expect(Number(blockNum)).to.be.greaterThan(0);
          expect(Number(timestamp)).to.be.greaterThan(0);
        },
      },
      {
        name: "should return [number, timestamp] for a specific block",
        input: "@block(1)",
        validate: (result) => {
          expect(result).to.be.an("array");
          expect(result).to.have.lengthOf(2);
          expect(result[0]).to.equal("1");
          expect(Number(result[1])).to.be.greaterThan(0);
        },
      },
    ],
    docCases: [
      {
        description: "Get latest block number and timestamp",
        code: `set [$num $timestamp] @block()\nprint $num\nprint $timestamp`,
      },
      {
        description: "Get a specific block's timestamp",
        code: `set [$num $timestamp] @block(1)\nprint $timestamp`,
      },
    ],
    sampleArgs: ["1"],
  },
  helpers.block.argDefs,
);

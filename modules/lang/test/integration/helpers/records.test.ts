import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@keys",
  {
    module: "lang [@keys]",
    cases: [
      {
        name: "returns the names of a record literal",
        input: "@keys([a:1 b:2])",
        validate(result) {
          expect(result).to.eql(["a", "b"]);
        },
      },
      {
        name: "accepts hand-written [name value] pairs",
        input: '@keys([["a" 1] ["b" 2]])',
        validate(result) {
          expect(result).to.eql(["a", "b"]);
        },
      },
      {
        name: "returns an empty array for an empty record",
        input: "@keys([])",
        validate(result) {
          expect(result).to.eql([]);
        },
      },
    ],
    docCases: [
      {
        description: "List a record's entry names",
        code: "load lang [@keys]\nset $inputs [a:3 b:11]\nset $names @keys($inputs)",
        preamble: "",
      },
    ],
    errorCases: [
      {
        name: "should fail on a non-record array",
        input: "@keys([1 2 3])",
        error: "must be a record",
      },
    ],
    sampleArgs: ["[a:1]"],
  },
  helpers.keys.argDefs,
);

describeHelper(
  "@values",
  {
    module: "lang [@values]",
    cases: [
      {
        name: "returns the values of a record literal",
        input: "@values([a:1 b:2])",
        validate(result) {
          expect(result).to.have.length(2);
          expect(result[0].eq(Num(1n))).to.be.true;
          expect(result[1].eq(Num(2n))).to.be.true;
        },
      },
      {
        name: "keeps nested arrays intact",
        input: '@values([siblings:[1 2] label:"x"])',
        validate(result) {
          expect(result[0]).to.have.length(2);
          expect(result[1]).to.equal("x");
        },
      },
    ],
    docCases: [
      {
        description: "List a record's values",
        code: "load lang [@values]\nset $inputs [a:3 b:11]\nset $signals @values($inputs)",
        preamble: "",
      },
    ],
    errorCases: [
      {
        name: "should fail on a non-record array",
        input: "@values([1 2 3])",
        error: "must be a record",
      },
    ],
    sampleArgs: ["[a:1]"],
  },
  helpers.values.argDefs,
);

describeHelper(
  "@lookup",
  {
    module: "lang [@lookup]",
    cases: [
      {
        name: "looks an entry up by name",
        input: "@lookup([a:1 b:2] b)",
        validate(result) {
          expect(result.eq(Num(2n))).to.be.true;
        },
      },
      {
        name: "works on hand-written pairs",
        input: '@lookup([["fee" 30]] fee)',
        validate(result) {
          expect(result.eq(Num(30n))).to.be.true;
        },
      },
    ],
    docCases: [
      {
        description: "Read one entry from a record",
        code: "load lang [@lookup]\nset $config [fee:30 pool:100]\nset $fee @lookup($config fee)",
        preamble: "",
      },
    ],
    errorCases: [
      {
        name: "should fail on a missing entry",
        input: "@lookup([a:1] c)",
        error: 'no entry named "c" — record has: a',
      },
      {
        name: "should fail on a non-record array",
        input: "@lookup([1 2] a)",
        error: "must be a record",
      },
    ],
    sampleArgs: ["[a:1]", "a"],
  },
  helpers.lookup.argDefs,
);

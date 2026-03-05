import { describe, it } from "bun:test";
import { type Case, expect, runCases, runParser } from "@evmcrispr/test-utils";
import { callExpressionParser } from "../../../src/parsers/call";

export const callParserDescribe = () =>
  describe("Parsers - call expression", () => {
    it("should parse call expressions correctly", () => {
      const cases: Case[] = [
        [
          `0x14FA5C16Af56190239B997485656F5c8b4f86c4b::getEntry(0, @token(WETH))`,
          {
            type: "CallExpression",
            target: {
              type: "AddressLiteral",
              value: "0x14FA5C16Af56190239B997485656F5c8b4f86c4b",
              loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 42 } },
            },
            method: "getEntry",
            args: [
              {
                type: "NumberLiteral",
                value: "0",
                loc: { start: { line: 1, col: 53 }, end: { line: 1, col: 54 } },
              },
              {
                type: "HelperFunctionExpression",
                name: "token",
                args: [
                  {
                    type: "Bareword",
                    value: "WETH",
                    loc: {
                      start: { line: 1, col: 63 },
                      end: { line: 1, col: 67 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 56 }, end: { line: 1, col: 68 } },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 69 } },
          },
        ],
        [
          `$superfluid::createFlow(@token("DAIx"), $finance::vault([1,2,3]), $contract::method(), 10e18m, 'this is a nice description')`,
          {
            type: "CallExpression",
            target: {
              type: "VariableIdentifier",
              value: "$superfluid",
              loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 11 } },
            },
            method: "createFlow",
            args: [
              {
                type: "HelperFunctionExpression",
                name: "token",
                args: [
                  {
                    type: "StringLiteral",
                    value: "DAIx",
                    loc: {
                      start: { line: 1, col: 31 },
                      end: { line: 1, col: 37 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 24 }, end: { line: 1, col: 38 } },
              },
              {
                type: "CallExpression",
                target: {
                  type: "VariableIdentifier",
                  value: "$finance",
                  loc: {
                    start: { line: 1, col: 40 },
                    end: { line: 1, col: 48 },
                  },
                },
                method: "vault",
                args: [
                  {
                    type: "ArrayExpression",
                    elements: [
                      {
                        type: "NumberLiteral",
                        value: "1",
                        loc: {
                          start: { line: 1, col: 57 },
                          end: { line: 1, col: 58 },
                        },
                      },
                      {
                        type: "NumberLiteral",
                        value: "2",
                        loc: {
                          start: { line: 1, col: 59 },
                          end: { line: 1, col: 60 },
                        },
                      },
                      {
                        type: "NumberLiteral",
                        value: "3",
                        loc: {
                          start: { line: 1, col: 61 },
                          end: { line: 1, col: 62 },
                        },
                      },
                    ],
                    loc: {
                      start: { line: 1, col: 56 },
                      end: { line: 1, col: 63 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 40 }, end: { line: 1, col: 64 } },
              },
              {
                type: "CallExpression",
                target: {
                  type: "VariableIdentifier",
                  value: "$contract",
                  loc: {
                    start: { line: 1, col: 66 },
                    end: { line: 1, col: 75 },
                  },
                },
                method: "method",
                args: [],
                loc: { start: { line: 1, col: 66 }, end: { line: 1, col: 85 } },
              },
              {
                type: "NumberLiteral",
                value: "10",
                power: 18,
                timeUnit: "m",
                loc: { start: { line: 1, col: 87 }, end: { line: 1, col: 93 } },
              },
              {
                type: "StringLiteral",
                value: "this is a nice description",
                loc: {
                  start: { line: 1, col: 95 },
                  end: { line: 1, col: 123 },
                },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 124 } },
          },
          "invalid nested call expression",
        ],
        [
          `@token(DAIx)::upgrade(@token(DAI), 1800e18)`,
          {
            type: "CallExpression",
            target: {
              type: "HelperFunctionExpression",
              name: "token",
              args: [
                {
                  type: "Bareword",
                  value: "DAIx",
                  loc: {
                    start: { line: 1, col: 7 },
                    end: { line: 1, col: 11 },
                  },
                },
              ],
              loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 12 } },
            },
            method: "upgrade",
            args: [
              {
                type: "HelperFunctionExpression",
                name: "token",
                args: [
                  {
                    type: "Bareword",
                    value: "DAI",
                    loc: {
                      start: { line: 1, col: 29 },
                      end: { line: 1, col: 32 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 22 }, end: { line: 1, col: 33 } },
              },
              {
                type: "NumberLiteral",
                value: "1800",
                power: 18,
                loc: { start: { line: 1, col: 35 }, end: { line: 1, col: 42 } },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 43 } },
          },
          "invalid helper call expression",
        ],
        [
          `$registryContract::getToken(1)::approve(@me, 560.25e18)::another()`,
          {
            type: "CallExpression",
            target: {
              type: "CallExpression",
              target: {
                type: "CallExpression",
                target: {
                  type: "VariableIdentifier",
                  value: "$registryContract",
                  loc: {
                    start: { line: 1, col: 0 },
                    end: { line: 1, col: 17 },
                  },
                },
                method: "getToken",
                args: [
                  {
                    type: "NumberLiteral",
                    value: "1",
                    loc: {
                      start: { line: 1, col: 28 },
                      end: { line: 1, col: 29 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 30 } },
              },
              method: "approve",
              args: [
                {
                  type: "HelperFunctionExpression",
                  name: "me",
                  args: [],
                  loc: {
                    start: { line: 1, col: 40 },
                    end: { line: 1, col: 43 },
                  },
                },
                {
                  type: "NumberLiteral",
                  value: "560.25",
                  power: 18,
                  loc: {
                    start: { line: 1, col: 45 },
                    end: { line: 1, col: 54 },
                  },
                },
              ],
              loc: { start: { line: 1, col: 32 }, end: { line: 1, col: 55 } },
            },
            method: "another",
            args: [],
            loc: { start: { line: 1, col: 57 }, end: { line: 1, col: 66 } },
          },
          "invalid recursive call expression",
        ],
      ];

      runCases(cases, callExpressionParser);
    });

    it("should parse inline ABI call with no args", () => {
      const result = runParser(
        callExpressionParser,
        `$dao::{tokens()(string)}`,
      );
      expect(result).to.deep.include({
        type: "CallExpression",
        method: "tokens",
        inputTypes: "()",
        outputTypes: "(string)",
        args: [],
      });
      expect(result.target).to.deep.include({
        type: "VariableIdentifier",
        value: "$dao",
      });
    });

    it("should parse inline ABI call with one arg", () => {
      const result = runParser(
        callExpressionParser,
        `$dao::{balanceOf(address)(uint256) @me}`,
      );
      expect(result).to.deep.include({
        type: "CallExpression",
        method: "balanceOf",
        inputTypes: "(address)",
        outputTypes: "(uint256)",
      });
      expect(result.args).to.have.lengthOf(1);
      expect(result.args[0]).to.deep.include({
        type: "HelperFunctionExpression",
        name: "me",
      });
    });

    it("should parse inline ABI call with tuple output types", () => {
      const result = runParser(
        callExpressionParser,
        `$dao::{tokens()(string,(uint,address)[])}`,
      );
      expect(result).to.deep.include({
        type: "CallExpression",
        method: "tokens",
        inputTypes: "()",
        outputTypes: "(string,(uint,address)[])",
        args: [],
      });
    });

    it("should parse call with return destructure", () => {
      const result = runParser(callExpressionParser, `$dao::getInfo()[,$]`);
      expect(result).to.deep.include({
        type: "CallExpression",
        method: "getInfo",
      });
      expect(result.returnDestructure).to.deep.equal([null, "$"]);
    });

    it("should parse inline ABI call with nested return destructure", () => {
      const result = runParser(
        callExpressionParser,
        `$dao::{tokens()(string,(uint,address)[])}[,[[,$]]]`,
      );
      expect(result).to.deep.include({
        type: "CallExpression",
        method: "tokens",
        inputTypes: "()",
        outputTypes: "(string,(uint,address)[])",
      });
      expect(result.returnDestructure).to.deep.equal([null, [[null, "$"]]]);
    });

    it("should parse inline ABI chain with destructure", () => {
      const result = runParser(
        callExpressionParser,
        `$dao::{tokens()(string,(uint,address)[])}[,[[,$]]]::{balanceOf(address)(uint256) @me}`,
      );
      expect(result.type).to.equal("CallExpression");
      expect(result.method).to.equal("balanceOf");
      expect(result.inputTypes).to.equal("(address)");
      expect(result.outputTypes).to.equal("(uint256)");
      expect(result.args).to.have.lengthOf(1);
      expect(result.args[0]).to.deep.include({
        type: "HelperFunctionExpression",
        name: "me",
      });

      const inner = result.target;
      expect(inner).to.deep.include({
        type: "CallExpression",
        method: "tokens",
        inputTypes: "()",
        outputTypes: "(string,(uint,address)[])",
      });
      expect(inner.returnDestructure).to.deep.equal([null, [[null, "$"]]]);
    });

    it("should parse mixed chain: regular call then inline ABI", () => {
      const result = runParser(
        callExpressionParser,
        `$registry::getToken(1)::{balanceOf(address)(uint256) @me}`,
      );
      expect(result).to.deep.include({
        type: "CallExpression",
        method: "balanceOf",
        inputTypes: "(address)",
        outputTypes: "(uint256)",
      });
      expect(result.target).to.deep.include({
        type: "CallExpression",
        method: "getToken",
      });
      expect(result.target.inputTypes).to.be.undefined;
    });

    it("should parse return destructure with empty slots", () => {
      const result = runParser(callExpressionParser, `$c::method()[,,$]`);
      expect(result.returnDestructure).to.deep.equal([null, null, "$"]);
    });

    it("should parse inline ABI with address target", () => {
      const result = runParser(
        callExpressionParser,
        `0x14FA5C16Af56190239B997485656F5c8b4f86c4b::{name()(string)}`,
      );
      expect(result).to.deep.include({
        type: "CallExpression",
        method: "name",
        inputTypes: "()",
        outputTypes: "(string)",
      });
      expect(result.target).to.deep.include({
        type: "AddressLiteral",
        value: "0x14FA5C16Af56190239B997485656F5c8b4f86c4b",
      });
    });

    it("should parse inline ABI with multiple args", () => {
      const result = runParser(
        callExpressionParser,
        `$c::{transfer(address,uint256)(bool) @me 100e18}`,
      );
      expect(result).to.deep.include({
        type: "CallExpression",
        method: "transfer",
        inputTypes: "(address,uint256)",
        outputTypes: "(bool)",
      });
      expect(result.args).to.have.lengthOf(2);
      expect(result.args[0]).to.deep.include({
        type: "HelperFunctionExpression",
        name: "me",
      });
      expect(result.args[1]).to.deep.include({
        type: "NumberLiteral",
        value: "100",
        power: 18,
      });
    });
  });

callParserDescribe();

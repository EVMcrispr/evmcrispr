import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { type Case, runCases, runParser } from "@evmcrispr/test-utils/evml";
import { callExpressionParser } from "../../../src/parsers/call";

export const callParserDescribe = () =>
  describe("Parsers - call expression", () => {
    it("should parse call expressions correctly", () => {
      const cases: Case[] = [
        [
          `0x14FA5C16Af56190239B997485656F5c8b4f86c4b::getEntry(0 @token(WETH))`,
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
                      start: { line: 1, col: 62 },
                      end: { line: 1, col: 66 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 55 }, end: { line: 1, col: 67 } },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 68 } },
          },
        ],
        [
          `$superfluid::createFlow(@token("DAIx") $finance::vault([1 2 3]) $contract::method() 10e18m 'this is a nice description')`,
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
                    start: { line: 1, col: 39 },
                    end: { line: 1, col: 47 },
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
                          start: { line: 1, col: 56 },
                          end: { line: 1, col: 57 },
                        },
                      },
                      {
                        type: "NumberLiteral",
                        value: "2",
                        loc: {
                          start: { line: 1, col: 58 },
                          end: { line: 1, col: 59 },
                        },
                      },
                      {
                        type: "NumberLiteral",
                        value: "3",
                        loc: {
                          start: { line: 1, col: 60 },
                          end: { line: 1, col: 61 },
                        },
                      },
                    ],
                    loc: {
                      start: { line: 1, col: 55 },
                      end: { line: 1, col: 62 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 39 }, end: { line: 1, col: 63 } },
              },
              {
                type: "CallExpression",
                target: {
                  type: "VariableIdentifier",
                  value: "$contract",
                  loc: {
                    start: { line: 1, col: 64 },
                    end: { line: 1, col: 73 },
                  },
                },
                method: "method",
                args: [],
                loc: { start: { line: 1, col: 64 }, end: { line: 1, col: 83 } },
              },
              {
                type: "NumberLiteral",
                value: "10",
                power: 18,
                timeUnit: "m",
                loc: { start: { line: 1, col: 84 }, end: { line: 1, col: 90 } },
              },
              {
                type: "StringLiteral",
                value: "this is a nice description",
                loc: {
                  start: { line: 1, col: 91 },
                  end: { line: 1, col: 119 },
                },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 120 } },
          },
          "invalid nested call expression",
        ],
        [
          `@token(DAIx)::upgrade(@token(DAI) 1800e18)`,
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
                loc: { start: { line: 1, col: 34 }, end: { line: 1, col: 41 } },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 42 } },
          },
          "invalid helper call expression",
        ],
        [
          `$registryContract::getToken(1)::approve(@me 560.25e18)::another()`,
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
                    start: { line: 1, col: 44 },
                    end: { line: 1, col: 53 },
                  },
                },
              ],
              loc: { start: { line: 1, col: 32 }, end: { line: 1, col: 54 } },
            },
            method: "another",
            args: [],
            loc: { start: { line: 1, col: 56 }, end: { line: 1, col: 65 } },
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

    it("should parse inline ABI call with a variable arg before the closing brace", () => {
      const result = runParser(
        callExpressionParser,
        `$dao::{balanceOf(address)(uint256) $holder}`,
      );
      expect(result).to.deep.include({
        type: "CallExpression",
        method: "balanceOf",
        inputTypes: "(address)",
        outputTypes: "(uint256)",
      });
      expect(result.args).to.have.lengthOf(1);
      expect(result.args[0]).to.deep.include({
        type: "VariableIdentifier",
        value: "$holder",
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
      const result = runParser(callExpressionParser, `$dao::getInfo()[_ $]`);
      expect(result).to.deep.include({
        type: "CallExpression",
        method: "getInfo",
      });
      expect(result.returnDestructure).to.deep.equal([null, "$"]);
    });

    it("should parse inline ABI call with nested return destructure", () => {
      const result = runParser(
        callExpressionParser,
        `$dao::{tokens()(string,(uint,address)[])}[_ [[_ $]]]`,
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
        `$dao::{tokens()(string,(uint,address)[])}[_ [[_ $]]]::{balanceOf(address)(uint256) @me}`,
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
      const result = runParser(callExpressionParser, `$c::method()[_ _ $]`);
      expect(result.returnDestructure).to.deep.equal([null, null, "$"]);
    });

    it("should parse a rest marker in a return destructure", () => {
      const result = runParser(callExpressionParser, `$c::method()[... $ _]`);
      expect(result.returnDestructure).to.deep.equal(["...", "$", null]);
    });

    it("should parse a nested rest marker in a return destructure", () => {
      const result = runParser(callExpressionParser, `$c::method()[[... $]]`);
      expect(result.returnDestructure).to.deep.equal([["...", "$"]]);
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

    it("should parse a nested inline ABI call as an argument", () => {
      const result = runParser(
        callExpressionParser,
        `$a::{a(address)(uint256,uint256[]) $b::{b(uint256,uint256)(address) $c::{c(address)(uint256) @me} $d::{d()(uint256)}}}[_ [$]]`,
      );
      expect(result).to.deep.include({
        type: "CallExpression",
        method: "a",
        inputTypes: "(address)",
        outputTypes: "(uint256,uint256[])",
      });
      expect(result.returnDestructure).to.deep.equal([null, ["$"]]);
      expect(result.args).to.have.lengthOf(1);

      const b = result.args[0];
      expect(b).to.deep.include({
        type: "CallExpression",
        method: "b",
        inputTypes: "(uint256,uint256)",
        outputTypes: "(address)",
      });
      expect(b.args).to.have.lengthOf(2);
      expect(b.args[0]).to.deep.include({
        type: "CallExpression",
        method: "c",
        inputTypes: "(address)",
        outputTypes: "(uint256)",
      });
      expect(b.args[0].args[0]).to.deep.include({
        type: "HelperFunctionExpression",
        name: "me",
      });
      expect(b.args[1]).to.deep.include({
        type: "CallExpression",
        method: "d",
        inputTypes: "()",
        outputTypes: "(uint256)",
      });
    });

    it("should parse a lens on a nested inline ABI call argument", () => {
      const result = runParser(
        callExpressionParser,
        `$a::{a(address)(uint256) $b::{b()(address,address[][])}[_ [_ $]]}`,
      );
      expect(result).to.deep.include({
        type: "CallExpression",
        method: "a",
        inputTypes: "(address)",
        outputTypes: "(uint256)",
      });
      expect(result.args).to.have.lengthOf(1);
      const b = result.args[0];
      expect(b).to.deep.include({
        type: "CallExpression",
        method: "b",
        inputTypes: "()",
        outputTypes: "(address,address[][])",
      });
      expect(b.args).to.have.lengthOf(0);
      expect(b.returnDestructure).to.deep.equal([null, [null, "$"]]);
    });
  });

callParserDescribe();

describe("Parsers - call expression (multiline)", () => {
  it("should parse method-call args spanning multiple lines", () => {
    const result = runParser(
      callExpressionParser,
      `$contract::transfer(\n  $to\n  100e18\n)`,
    );
    expect(result).to.deep.include({
      type: "CallExpression",
      method: "transfer",
    });
    expect(result.args).to.have.lengthOf(2);
    expect(result.args[0]).to.deep.include({
      type: "VariableIdentifier",
      value: "$to",
    });
    expect(result.args[0].loc).to.eql({
      start: { line: 2, col: 2 },
      end: { line: 2, col: 5 },
    });
    expect(result.args[1]).to.deep.include({
      type: "NumberLiteral",
      value: "100",
      power: 18,
    });
    expect(result.args[1].loc).to.eql({
      start: { line: 3, col: 2 },
      end: { line: 3, col: 8 },
    });
    expect(result.loc).to.eql({
      start: { line: 1, col: 0 },
      end: { line: 4, col: 1 },
    });
  });

  it("should parse inline ABI call args spanning multiple lines", () => {
    const result = runParser(
      callExpressionParser,
      `$c::{transfer(address,uint256)(bool)\n  @me\n  100e18\n}`,
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

describe("Parsers - call expression (!:: read hops)", () => {
  it("parses a top-level !:: hop with an inline ABI", () => {
    const result = runParser(
      callExpressionParser,
      `0x14FA5C16Af56190239B997485656F5c8b4f86c4b!::{balanceOf(address)(uint256) @me}`,
    );
    expect(result).to.deep.include({
      type: "CallExpression",
      method: "balanceOf",
      bang: true,
      inputTypes: "(address)",
      outputTypes: "(uint256)",
    });
    expect(result.target).to.deep.include({
      type: "AddressLiteral",
      value: "0x14FA5C16Af56190239B997485656F5c8b4f86c4b",
    });
    expect(result.args).to.have.lengthOf(1);
  });

  it("parses a variable head before !::", () => {
    const result = runParser(callExpressionParser, `$reg!::{fee()(uint24)}`);
    expect(result).to.deep.include({
      type: "CallExpression",
      method: "fee",
      bang: true,
      inputTypes: "()",
      outputTypes: "(uint24)",
    });
    expect(result.target).to.deep.include({
      type: "VariableIdentifier",
      value: "$reg",
    });
  });

  it("parses a computed (bang helper) head before !::", () => {
    const result = runParser(
      callExpressionParser,
      `@bytes!($reg::packedPool() ">>" 96)!::{fee()(uint24)}`,
    );
    expect(result).to.deep.include({
      type: "CallExpression",
      method: "fee",
      bang: true,
    });
    expect(result.target).to.deep.include({
      type: "HelperFunctionExpression",
      name: "bytes!",
    });
    expect(result.target.args).to.have.lengthOf(3);
  });

  it("parses a plain hop chained into a !:: hop", () => {
    const result = runParser(
      callExpressionParser,
      `$a::{asset()(address)}!::{totalSupply()(uint256)}`,
    );
    expect(result).to.deep.include({
      type: "CallExpression",
      method: "totalSupply",
      bang: true,
    });
    expect(result.target).to.deep.include({
      type: "CallExpression",
      method: "asset",
    });
    expect(result.target.bang).to.equal(undefined);
  });

  it("keeps plain hops unflagged and applies lenses to !:: hops", () => {
    const result = runParser(
      callExpressionParser,
      `$a!::{getReserves()(uint112,uint112)}[$ _]`,
    );
    expect(result).to.deep.include({
      type: "CallExpression",
      method: "getReserves",
      bang: true,
    });
    expect(result.returnDestructure).to.deep.equal(["$", null]);
  });

  it("continues a chain after a !:: hop", () => {
    const result = runParser(
      callExpressionParser,
      `$a!::{vault()(address)}::{totalSupply()(uint256)}`,
    );
    expect(result).to.deep.include({
      type: "CallExpression",
      method: "totalSupply",
    });
    expect(result.bang).to.equal(undefined);
    expect(result.target).to.deep.include({
      type: "CallExpression",
      method: "vault",
      bang: true,
    });
  });

  it("rejects the named-method form after !:: with a clear error", () => {
    const error = runParser(callExpressionParser, `$a!::fee()`);
    expect(String(error)).to.include("CallParserError");
    expect(String(error)).to.include("inline ABI form");
  });
});

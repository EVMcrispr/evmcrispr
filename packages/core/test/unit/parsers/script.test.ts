import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { type Case, runCases } from "@evmcrispr/test-utils/evml";
import { parseScript, scriptParser } from "../../../src/parsers/script";

describe("Parsers - script", () => {
  it("should parse an script correctly", () => {
    const script = `
      load aragonos
      load superfluid\r\n
      
      aragonos:connect my-dao-ens (   
        forward token-manager voting      (
          install wrapper-hooked-token-manager.open 0x83E57888cd55C3ea1cfbf0114C963564d81e318d false 0
        
        
        )     




        forward token-manager voting agent (
          
          set $agent finance::vault()

          forward wrappable-token-manager.open disputable-voting.open agent (
            set $daix @token("fDAIx")







            
            superfluid:token approve @token('DAI') @me 15.45e18


            superfluid:batchcall (
              token upgrade $daix 4500.43e18
              flow create $daix $agent 1e18mo
              token downgrade @token('USDCx')
            )


          )
          
          
        ) 
        
        
                          )
  
  
      
      `;

    const c: Case = [
      script,
      {
        type: "Program",
        body: [
          {
            type: "CommandExpression",
            name: "load",
            args: [
              {
                type: "Bareword",
                value: "aragonos",
                loc: {
                  start: {
                    line: 2,
                    col: 11,
                  },
                  end: {
                    line: 2,
                    col: 19,
                  },
                },
              },
            ],
            opts: [],
            loc: {
              start: {
                line: 2,
                col: 6,
              },
              end: {
                line: 2,
                col: 19,
              },
            },
          },
          {
            type: "CommandExpression",
            name: "load",
            args: [
              {
                type: "Bareword",
                value: "superfluid",
                loc: {
                  start: {
                    line: 3,
                    col: 11,
                  },
                  end: {
                    line: 3,
                    col: 21,
                  },
                },
              },
            ],
            opts: [],
            loc: {
              start: {
                line: 3,
                col: 6,
              },
              end: {
                line: 3,
                col: 21,
              },
            },
          },
          {
            type: "CommandExpression",
            module: "aragonos",
            name: "connect",
            args: [
              {
                type: "Bareword",
                value: "my-dao-ens",
                loc: {
                  start: {
                    line: 6,
                    col: 23,
                  },
                  end: {
                    line: 6,
                    col: 33,
                  },
                },
              },
              {
                type: "BlockExpression",
                body: [
                  {
                    type: "CommandExpression",
                    name: "forward",
                    args: [
                      {
                        type: "Bareword",
                        value: "token-manager",
                        loc: {
                          start: {
                            line: 7,
                            col: 16,
                          },
                          end: {
                            line: 7,
                            col: 29,
                          },
                        },
                      },
                      {
                        type: "Bareword",
                        value: "voting",
                        loc: {
                          start: {
                            line: 7,
                            col: 30,
                          },
                          end: {
                            line: 7,
                            col: 36,
                          },
                        },
                      },
                      {
                        type: "BlockExpression",
                        body: [
                          {
                            type: "CommandExpression",
                            name: "install",
                            args: [
                              {
                                type: "Bareword",
                                value: "wrapper-hooked-token-manager.open",
                                loc: {
                                  start: {
                                    line: 8,
                                    col: 18,
                                  },
                                  end: {
                                    line: 8,
                                    col: 51,
                                  },
                                },
                              },
                              {
                                type: "AddressLiteral",
                                value:
                                  "0x83E57888cd55C3ea1cfbf0114C963564d81e318d",
                                loc: {
                                  start: {
                                    line: 8,
                                    col: 52,
                                  },
                                  end: {
                                    line: 8,
                                    col: 94,
                                  },
                                },
                              },
                              {
                                type: "BoolLiteral",
                                value: false,
                                loc: {
                                  start: {
                                    line: 8,
                                    col: 95,
                                  },
                                  end: {
                                    line: 8,
                                    col: 100,
                                  },
                                },
                              },
                              {
                                type: "NumberLiteral",
                                value: "0",
                                loc: {
                                  start: {
                                    line: 8,
                                    col: 101,
                                  },
                                  end: {
                                    line: 8,
                                    col: 102,
                                  },
                                },
                              },
                            ],
                            opts: [],
                            loc: {
                              start: {
                                line: 8,
                                col: 10,
                              },
                              end: {
                                line: 8,
                                col: 102,
                              },
                            },
                          },
                        ],
                        loc: {
                          start: {
                            line: 7,
                            col: 42,
                          },
                          end: {
                            line: 11,
                            col: 9,
                          },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: {
                        line: 7,
                        col: 8,
                      },
                      end: {
                        line: 11,
                        col: 9,
                      },
                    },
                  },
                  {
                    type: "CommandExpression",
                    name: "forward",
                    args: [
                      {
                        type: "Bareword",
                        value: "token-manager",
                        loc: {
                          start: {
                            line: 16,
                            col: 16,
                          },
                          end: {
                            line: 16,
                            col: 29,
                          },
                        },
                      },
                      {
                        type: "Bareword",
                        value: "voting",
                        loc: {
                          start: {
                            line: 16,
                            col: 30,
                          },
                          end: {
                            line: 16,
                            col: 36,
                          },
                        },
                      },
                      {
                        type: "Bareword",
                        value: "agent",
                        loc: {
                          start: {
                            line: 16,
                            col: 37,
                          },
                          end: {
                            line: 16,
                            col: 42,
                          },
                        },
                      },
                      {
                        type: "BlockExpression",
                        body: [
                          {
                            type: "CommandExpression",
                            name: "set",
                            args: [
                              {
                                type: "VariableIdentifier",
                                value: "$agent",
                                loc: {
                                  start: {
                                    line: 18,
                                    col: 14,
                                  },
                                  end: {
                                    line: 18,
                                    col: 20,
                                  },
                                },
                              },
                              {
                                type: "CallExpression",
                                target: {
                                  type: "Bareword",
                                  value: "finance",
                                  loc: {
                                    start: {
                                      line: 18,
                                      col: 21,
                                    },
                                    end: {
                                      line: 18,
                                      col: 28,
                                    },
                                  },
                                },
                                method: "vault",
                                args: [],
                                loc: {
                                  start: {
                                    line: 18,
                                    col: 21,
                                  },
                                  end: {
                                    line: 18,
                                    col: 37,
                                  },
                                },
                              },
                            ],
                            opts: [],
                            loc: {
                              start: {
                                line: 18,
                                col: 10,
                              },
                              end: {
                                line: 18,
                                col: 37,
                              },
                            },
                          },
                          {
                            type: "CommandExpression",
                            name: "forward",
                            args: [
                              {
                                type: "Bareword",
                                value: "wrappable-token-manager.open",
                                loc: {
                                  start: {
                                    line: 20,
                                    col: 18,
                                  },
                                  end: {
                                    line: 20,
                                    col: 46,
                                  },
                                },
                              },
                              {
                                type: "Bareword",
                                value: "disputable-voting.open",
                                loc: {
                                  start: {
                                    line: 20,
                                    col: 47,
                                  },
                                  end: {
                                    line: 20,
                                    col: 69,
                                  },
                                },
                              },
                              {
                                type: "Bareword",
                                value: "agent",
                                loc: {
                                  start: {
                                    line: 20,
                                    col: 70,
                                  },
                                  end: {
                                    line: 20,
                                    col: 75,
                                  },
                                },
                              },
                              {
                                type: "BlockExpression",
                                body: [
                                  {
                                    type: "CommandExpression",
                                    name: "set",
                                    args: [
                                      {
                                        type: "VariableIdentifier",
                                        value: "$daix",
                                        loc: {
                                          start: {
                                            line: 21,
                                            col: 16,
                                          },
                                          end: {
                                            line: 21,
                                            col: 21,
                                          },
                                        },
                                      },
                                      {
                                        type: "HelperFunctionExpression",
                                        name: "token",
                                        args: [
                                          {
                                            type: "StringLiteral",
                                            value: "fDAIx",
                                            loc: {
                                              start: {
                                                line: 21,
                                                col: 29,
                                              },
                                              end: {
                                                line: 21,
                                                col: 36,
                                              },
                                            },
                                          },
                                        ],
                                        loc: {
                                          start: {
                                            line: 21,
                                            col: 22,
                                          },
                                          end: {
                                            line: 21,
                                            col: 37,
                                          },
                                        },
                                      },
                                    ],
                                    opts: [],
                                    loc: {
                                      start: {
                                        line: 21,
                                        col: 12,
                                      },
                                      end: {
                                        line: 21,
                                        col: 37,
                                      },
                                    },
                                  },
                                  {
                                    type: "CommandExpression",
                                    module: "superfluid",
                                    name: "token",
                                    args: [
                                      {
                                        type: "Bareword",
                                        value: "approve",
                                        loc: {
                                          start: {
                                            line: 30,
                                            col: 29,
                                          },
                                          end: {
                                            line: 30,
                                            col: 36,
                                          },
                                        },
                                      },
                                      {
                                        type: "HelperFunctionExpression",
                                        name: "token",
                                        args: [
                                          {
                                            type: "StringLiteral",
                                            value: "DAI",
                                            loc: {
                                              start: {
                                                line: 30,
                                                col: 44,
                                              },
                                              end: {
                                                line: 30,
                                                col: 49,
                                              },
                                            },
                                          },
                                        ],
                                        loc: {
                                          start: {
                                            line: 30,
                                            col: 37,
                                          },
                                          end: {
                                            line: 30,
                                            col: 50,
                                          },
                                        },
                                      },
                                      {
                                        type: "HelperFunctionExpression",
                                        name: "me",
                                        args: [],
                                        loc: {
                                          start: {
                                            line: 30,
                                            col: 51,
                                          },
                                          end: {
                                            line: 30,
                                            col: 54,
                                          },
                                        },
                                      },
                                      {
                                        type: "NumberLiteral",
                                        value: "15.45",
                                        power: 18,
                                        loc: {
                                          start: {
                                            line: 30,
                                            col: 55,
                                          },
                                          end: {
                                            line: 30,
                                            col: 63,
                                          },
                                        },
                                      },
                                    ],
                                    opts: [],
                                    loc: {
                                      start: {
                                        line: 30,
                                        col: 12,
                                      },
                                      end: {
                                        line: 30,
                                        col: 63,
                                      },
                                    },
                                  },
                                  {
                                    type: "CommandExpression",
                                    module: "superfluid",
                                    name: "batchcall",
                                    args: [
                                      {
                                        type: "BlockExpression",
                                        body: [
                                          {
                                            type: "CommandExpression",
                                            name: "token",
                                            args: [
                                              {
                                                type: "Bareword",
                                                value: "upgrade",
                                                loc: {
                                                  start: {
                                                    line: 34,
                                                    col: 20,
                                                  },
                                                  end: {
                                                    line: 34,
                                                    col: 27,
                                                  },
                                                },
                                              },
                                              {
                                                type: "VariableIdentifier",
                                                value: "$daix",
                                                loc: {
                                                  start: {
                                                    line: 34,
                                                    col: 28,
                                                  },
                                                  end: {
                                                    line: 34,
                                                    col: 33,
                                                  },
                                                },
                                              },
                                              {
                                                type: "NumberLiteral",
                                                value: "4500.43",
                                                power: 18,
                                                loc: {
                                                  start: {
                                                    line: 34,
                                                    col: 34,
                                                  },
                                                  end: {
                                                    line: 34,
                                                    col: 44,
                                                  },
                                                },
                                              },
                                            ],
                                            opts: [],
                                            loc: {
                                              start: {
                                                line: 34,
                                                col: 14,
                                              },
                                              end: {
                                                line: 34,
                                                col: 44,
                                              },
                                            },
                                          },
                                          {
                                            type: "CommandExpression",
                                            name: "flow",
                                            args: [
                                              {
                                                type: "Bareword",
                                                value: "create",
                                                loc: {
                                                  start: {
                                                    line: 35,
                                                    col: 19,
                                                  },
                                                  end: {
                                                    line: 35,
                                                    col: 25,
                                                  },
                                                },
                                              },
                                              {
                                                type: "VariableIdentifier",
                                                value: "$daix",
                                                loc: {
                                                  start: {
                                                    line: 35,
                                                    col: 26,
                                                  },
                                                  end: {
                                                    line: 35,
                                                    col: 31,
                                                  },
                                                },
                                              },
                                              {
                                                type: "VariableIdentifier",
                                                value: "$agent",
                                                loc: {
                                                  start: {
                                                    line: 35,
                                                    col: 32,
                                                  },
                                                  end: {
                                                    line: 35,
                                                    col: 38,
                                                  },
                                                },
                                              },
                                              {
                                                type: "NumberLiteral",
                                                value: "1",
                                                power: 18,
                                                timeUnit: "mo",
                                                loc: {
                                                  start: {
                                                    line: 35,
                                                    col: 39,
                                                  },
                                                  end: {
                                                    line: 35,
                                                    col: 45,
                                                  },
                                                },
                                              },
                                            ],
                                            opts: [],
                                            loc: {
                                              start: {
                                                line: 35,
                                                col: 14,
                                              },
                                              end: {
                                                line: 35,
                                                col: 45,
                                              },
                                            },
                                          },
                                          {
                                            type: "CommandExpression",
                                            name: "token",
                                            args: [
                                              {
                                                type: "Bareword",
                                                value: "downgrade",
                                                loc: {
                                                  start: {
                                                    line: 36,
                                                    col: 20,
                                                  },
                                                  end: {
                                                    line: 36,
                                                    col: 29,
                                                  },
                                                },
                                              },
                                              {
                                                type: "HelperFunctionExpression",
                                                name: "token",
                                                args: [
                                                  {
                                                    type: "StringLiteral",
                                                    value: "USDCx",
                                                    loc: {
                                                      start: {
                                                        line: 36,
                                                        col: 37,
                                                      },
                                                      end: {
                                                        line: 36,
                                                        col: 44,
                                                      },
                                                    },
                                                  },
                                                ],
                                                loc: {
                                                  start: {
                                                    line: 36,
                                                    col: 30,
                                                  },
                                                  end: {
                                                    line: 36,
                                                    col: 45,
                                                  },
                                                },
                                              },
                                            ],
                                            opts: [],
                                            loc: {
                                              start: {
                                                line: 36,
                                                col: 14,
                                              },
                                              end: {
                                                line: 36,
                                                col: 45,
                                              },
                                            },
                                          },
                                        ],
                                        loc: {
                                          start: {
                                            line: 33,
                                            col: 33,
                                          },
                                          end: {
                                            line: 37,
                                            col: 13,
                                          },
                                        },
                                      },
                                    ],
                                    opts: [],
                                    loc: {
                                      start: {
                                        line: 33,
                                        col: 12,
                                      },
                                      end: {
                                        line: 37,
                                        col: 13,
                                      },
                                    },
                                  },
                                ],
                                loc: {
                                  start: {
                                    line: 20,
                                    col: 76,
                                  },
                                  end: {
                                    line: 40,
                                    col: 11,
                                  },
                                },
                              },
                            ],
                            opts: [],
                            loc: {
                              start: {
                                line: 20,
                                col: 10,
                              },
                              end: {
                                line: 40,
                                col: 11,
                              },
                            },
                          },
                        ],
                        loc: {
                          start: {
                            line: 16,
                            col: 43,
                          },
                          end: {
                            line: 43,
                            col: 9,
                          },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: {
                        line: 16,
                        col: 8,
                      },
                      end: {
                        line: 43,
                        col: 9,
                      },
                    },
                  },
                ],
                loc: {
                  start: {
                    line: 6,
                    col: 34,
                  },
                  end: {
                    line: 46,
                    col: 27,
                  },
                },
              },
            ],
            opts: [],
            loc: {
              start: {
                line: 6,
                col: 6,
              },
              end: {
                line: 46,
                col: 27,
              },
            },
          },
        ],
      },
    ];
    runCases(c, scriptParser);
  });

  it("should track lines correctly across a multi-line string and helper", () => {
    const script = `print "hello
world"
print @helper(
  arg1
  "arg2
  still arg2"
)`;
    const { ast } = parseScript(script);
    expect(ast.body).to.have.lengthOf(2);

    const [first, second] = ast.body;
    expect(first.name).to.equal("print");
    expect(first.args).to.have.lengthOf(1);
    expect(first.args[0]).to.deep.include({
      type: "StringLiteral",
      value: "hello\nworld",
    });
    expect(first.args[0].loc).to.eql({
      start: { line: 1, col: 6 },
      end: { line: 2, col: 6 },
    });

    expect(second.name).to.equal("print");
    expect(second.args).to.have.lengthOf(1);
    const helper = second.args[0] as any;
    expect(helper).to.deep.include({
      type: "HelperFunctionExpression",
      name: "helper",
    });
    expect(helper.loc.start).to.eql({ line: 3, col: 6 });
    expect(helper.loc.end).to.eql({ line: 7, col: 1 });
    expect(helper.args).to.have.lengthOf(2);
    expect(helper.args[0]).to.deep.include({
      type: "Bareword",
      value: "arg1",
    });
    expect(helper.args[0].loc).to.eql({
      start: { line: 4, col: 2 },
      end: { line: 4, col: 6 },
    });
    expect(helper.args[1]).to.deep.include({
      type: "StringLiteral",
      value: "arg2\n  still arg2",
    });
    expect(helper.args[1].loc).to.eql({
      start: { line: 5, col: 2 },
      end: { line: 6, col: 13 },
    });
  });

  describe("comma hint", () => {
    const HINT = "arguments are space-separated in EVML";

    const hinted = (script: string) =>
      parseScript(script).errors.filter((e) => e.includes(HINT));

    it("hints on commas in helper arguments", () => {
      expect(hinted("set $t @get(a,b)")).to.have.lengthOf(1);
    });

    it("hints on commas in command arguments", () => {
      expect(hinted("print a, b")).to.have.lengthOf(1);
      expect(hinted("print @token(DAI), 1")).to.have.lengthOf(1);
    });

    it("hints on commas in array elements", () => {
      expect(hinted("set $t [1, 2]")).to.have.lengthOf(1);
      expect(hinted("set $t [DAI, WETH]")).to.have.lengthOf(1);
      expect(hinted("set $t [@me, @num(1)]")).to.have.lengthOf(1);
    });

    it("does not hint on commas inside quoted strings", () => {
      expect(parseScript('print "a, b"').errors).to.have.lengthOf(0);
      expect(
        parseScript(
          'exec 0x4444444444444444444444444444444444444444 "transfer(address,uint256)" @me 1',
        ).errors,
      ).to.have.lengthOf(0);
    });

    it("does not hint on an unclosed quoted string containing a comma", () => {
      expect(hinted('print "a, b')).to.have.lengthOf(0);
    });

    it("does not hint on comma-free parse errors", () => {
      const { errors } = parseScript("set $t ((");
      expect(errors.length).to.be.greaterThan(0);
      expect(errors.filter((e) => e.includes(HINT))).to.have.lengthOf(0);
    });
  });

  describe("cost", () => {
    /** The bytes the parser reads back out of its input while parsing. */
    const bytesRead = (script: string): number => {
      const decode = TextDecoder.prototype.decode;
      let bytes = 0;
      TextDecoder.prototype.decode = function (input, options) {
        bytes += input?.byteLength ?? 0;
        return decode.call(this, input, options);
      };
      try {
        parseScript(script);
      } finally {
        TextDecoder.prototype.decode = decode;
      }
      return bytes;
    };

    it("reads its input a number of times that does not grow with the script", () => {
      const script = (lines: number) =>
        Array.from({ length: lines }, (_, i) =>
          i % 2 ? `set $a${i} @id("x")` : "# a comment",
        ).join("\n");
      const perByte = (lines: number) =>
        bytesRead(script(lines)) / script(lines).length;

      expect(perByte(400)).to.be.lessThan(perByte(50) * 1.5);
    });

    it("takes four times as long, not sixteen, on four times the comments of wide characters", () => {
      let parses = 0;
      // The fastest of three, each on a text not parsed before.
      const time = (lines: number) =>
        Math.min(
          ...[0, 1, 2].map(() => {
            const script = `${Array(lines)
              .fill(`# ${"═".repeat(70)}`)
              .join("\n")}\n# ${parses++}`;
            const start = performance.now();
            parseScript(script);
            return performance.now() - start;
          }),
        );

      expect(time(2000)).to.be.lessThan(time(500) * 8);
    });

    it("reads a chain of calls no more times on a longer script", () => {
      const script = (lines: number) =>
        Array(lines).fill("set $a $b::getToken(1)::approve(@me 1)").join("\n");
      const perByte = (lines: number) =>
        bytesRead(script(lines)) / script(lines).length;

      expect(parseScript(script(2)).errors).to.deep.equal([]);
      expect(perByte(400)).to.be.lessThan(perByte(50) * 1.5);
    });

    it("splits a script into lines once for all of its errors", () => {
      const script = Array(50).fill("set $a @id(1, 2)").join("\n");
      const split = String.prototype.split;
      let splits = 0;
      String.prototype.split = function (this: string, ...args: any[]) {
        if (String(this) === script) splits++;
        return (split as any).apply(this, args);
      } as typeof split;
      let errors: string[];
      try {
        errors = parseScript(script).errors;
      } finally {
        String.prototype.split = split;
      }

      expect(
        errors.filter((e) => e.includes("remove the comma")),
      ).to.have.length.greaterThan(1);
      expect(splits).to.equal(1);
    });

    it("parses an event tuple that is still open without trying every way to close it", () => {
      // What is on screen while `-> Evt(uint256,(address,uint256,bytes32))`
      // is being typed. One pattern over the whole list took seconds here.
      const script =
        'exec $a "f()" -> Evt(uint256,(address,uint256,bytes32,(uint256,address';
      const start = performance.now();
      const { errors } = parseScript(script);

      expect(errors).to.not.be.empty;
      expect(performance.now() - start).to.be.lessThan(250);
    });

    it("parses a helper once, however deep it is nested in others", () => {
      const nested = (depth: number) =>
        `set $a ${"@id(".repeat(depth)}1${")".repeat(depth)}`;

      expect(parseScript(nested(3)).errors).to.deep.equal([]);
      // Parsed twice per level, the deeper one would not finish.
      expect(bytesRead(nested(40))).to.be.lessThan(bytesRead(nested(10)) * 6);
    });

    it("does not parse again a script it has just parsed", () => {
      const script = 'set $a 1\nprint "parsed once"';
      parseScript(script);

      expect(bytesRead(script)).to.equal(0);
    });

    it("gives each caller its own list of errors", () => {
      const first = parseScript("set $t ((").errors;
      first.length = 0;

      expect(parseScript("set $t ((").errors).to.not.be.empty;
    });
  });

  describe("characters wider than a byte", () => {
    it("matches a token after them where it is", () => {
      const { ast, errors } = parseScript(
        '# ── título ──\nset $name "→ é" # ══\nset $other @id($name)',
      );
      const commands = ast.getAllCommandsUntilLine(Number.POSITIVE_INFINITY);

      expect(errors).to.deep.equal([]);
      expect(commands.map((c) => c.name)).to.deep.equal(["set", "set"]);
      expect(commands[0].args.map((a) => a.value)).to.deep.equal([
        "$name",
        "→ é",
      ]);
      expect(commands[1].loc).to.deep.equal({
        start: { line: 3, col: 0 },
        end: { line: 3, col: 21 },
      });
    });

    /** What a parse gives, as the grammar gave it before its `regex` was
     *  replaced: commands with their place, and the errors. */
    const outcome = (script: string) => {
      const { ast, errors } = parseScript(script);
      return {
        commands: ast.body.map((c) => [c.name, c.loc?.start.line]),
        errors,
      };
    };

    it("ends on a script that opens with an empty line and comments in them", () => {
      expect(outcome("\n# ══ título\nset $a 1")).to.deep.equal({
        commands: [["set", 3]],
        errors: [],
      });
      expect(outcome("\n\n# é\nset $a 1\n# ══\nprint 2")).to.deep.equal({
        commands: [
          ["set", 4],
          ["print", 6],
        ],
        errors: [],
      });
    });

    it("reads a comment with a character of four bytes", () => {
      expect(outcome("# 😀 x\nset $a 1")).to.deep.equal({
        commands: [["set", 2]],
        errors: [],
      });
    });

    it("reports a byte order mark as it always did", () => {
      expect(outcome("\uFEFFset $a 1")).to.deep.equal({
        commands: [],
        errors: [
          `CommandParserError(1:3): Expected a command name like "set" or "aragonos:connect" (letters and dashes, with an optional trailing !), got 'set $...'`,
        ],
      });
      expect(outcome('set $a "x"\n# é\uFEFF\nprint 1')).to.deep.equal({
        commands: [
          ["set", 1],
          ["print", 4],
        ],
        errors: [
          `CommandParserError(3:0): Expected a command name like "set" or "aragonos:connect" (letters and dashes, with an optional trailing !), got '\uFFFD\uFFFD\npr...'`,
        ],
      });
    });
  });
});

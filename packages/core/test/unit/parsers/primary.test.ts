import { describe, it } from "bun:test";
import type {
  BarewordNode,
  BooleanLiteralNode,
  BytesLiteralNode,
  Location,
  NumericLiteralNode,
  StringLiteralNode,
  VariableIdentifierNode,
} from "@evmcrispr/sdk";
import { NodeType } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import type { Case } from "@evmcrispr/test-utils/evml";
import { runCases, runErrorCase, runParser } from "@evmcrispr/test-utils/evml";
import { arrayExpressionParser } from "../../../src/parsers/array";
import {
  ADDRESS_PARSER_ERROR,
  addressParser,
  BAREWORD_PARSER_ERROR,
  BOOLEAN_PARSER_ERROR,
  barewordParser,
  booleanParser,
  heredocParser,
  hexadecimalParser,
  numberParser,
  STRING_PARSER_ERROR,
  stringParser,
  VARIABLE_PARSER_ERROR,
  variableIdentifierParser,
} from "../../../src/parsers/primaries";
import { HEREDOC_PARSER_ERROR } from "../../../src/parsers/primaries/literals/heredoc";
import { HEXADECIMAL_PARSER_ERROR } from "../../../src/parsers/primaries/literals/hexadecimal";

const buildLocation = (value: string): Location => ({
  start: {
    line: 1,
    col: 0,
  },
  end: {
    line: 1,
    col: value.length,
  },
});

describe("Parsers - primary", () => {
  describe("when parsing literal values", () => {
    describe("when parsing address values", () => {
      it("should parse them correctly", () => {
        expect(
          runParser(
            addressParser(),
            "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3",
          ),
        ).to.deep.equal({
          type: "AddressLiteral",
          value: "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3",
          loc: buildLocation("0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3"),
        });
      });

      it("should fail when parsing an invalid one", () => {
        runErrorCase(
          addressParser(),
          "0xasdabmtbrtbrtgsdfsvbrty",
          ADDRESS_PARSER_ERROR,
          'Expected an address: "0x" followed by 40 hex characters',
        );
      });
    });

    describe("when parsing hexadecimal values", () => {
      const n = (value: string): BytesLiteralNode => ({
        type: NodeType.BytesLiteral,
        value,
        loc: buildLocation(value),
      });
      it("should parse them correctly", () => {
        const cases: Case[] = [
          ["0xa3432da4567be", n("0xa3432da4567be")],
          [
            "0x0e80f0b30000000000000000000000008e6cd950ad6ba651f6dd608dc70e5886b1aa6b240000000000000000000000002f00df4f995451e0df337b91744006eb8892bfb10000000000000000000000000000000000000000000000004563918244f40000",
            n(
              "0x0e80f0b30000000000000000000000008e6cd950ad6ba651f6dd608dc70e5886b1aa6b240000000000000000000000002f00df4f995451e0df337b91744006eb8892bfb10000000000000000000000000000000000000000000000004563918244f40000",
            ),
          ],
        ];

        runCases(cases, hexadecimalParser());
      });

      it("should fail when parsing an invalid one", () => {
        runErrorCase(
          hexadecimalParser(),
          "0xasdadqlkerrtrtnrn",
          HEXADECIMAL_PARSER_ERROR,
          'Expected a hex value: "0x" followed by hex characters (e.g. 0xdeadbeef)',
        );
      });
    });

    describe("when parsing boolean values", () => {
      it("should parse them correctly", () => {
        const n = (value: boolean): BooleanLiteralNode => ({
          type: NodeType.BoolLiteral,
          value,
          loc: buildLocation(value ? "true" : "false"),
        });

        const cases: Case[] = [
          ["true", n(true)],
          ["false", n(false)],
        ];

        runCases(cases, booleanParser());
      });

      it("should fail when parsing an invalid one", () => {
        runErrorCase(
          booleanParser(),
          "fals",
          BOOLEAN_PARSER_ERROR,
          'Expected "true" or "false"',
        );
      });
    });

    describe("when parsing numeric values", () => {
      const errorType = "NumberParserError";

      it("should parse them correctly", () => {
        const node = (
          value: number,
          power?: number,
          timeUnit?: string,
          raw?: string,
        ): NumericLiteralNode => {
          const locStr =
            raw ??
            value.toString() +
              (power !== undefined ? `${power.toString()}e` : "") +
              (timeUnit ?? "");
          const n: NumericLiteralNode = {
            type: NodeType.NumberLiteral,
            value: String(value),
            loc: buildLocation(locStr),
          };
          if (power !== undefined) n.power = power;
          if (timeUnit) n.timeUnit = timeUnit;

          return n;
        };
        const cases: Case[] = [
          ["15", node(15)],
          ["9200e18", node(9200, 18)],
          ["4500.32", node(4500.32)],
          ["0.5e14", node(0.5, 14)],
          ["20.3245e18mo", node(20.3245, 18, "mo")],
          ["50s", node(50, undefined, "s")],
          ["5m", node(5, undefined, "m")],
          ["35h", node(35, undefined, "h")],
          ["365d", node(365, undefined, "d")],
          ["72w", node(72, undefined, "w")],
          ["6.5mo", node(6.5, undefined, "mo")],
          ["2.5y", node(2.5, undefined, "y")],
          ["100wei", node(100, 0, undefined, "100wei")],
          ["1gwei", node(1, 9, undefined, "1gwei")],
          ["1eth", node(1, 18, undefined, "1eth")],
          ["0.5eth", node(0.5, 18, undefined, "0.5eth")],
          ["1.5gwei", node(1.5, 9, undefined, "1.5gwei")],
          ["-15", node(-15)],
          ["-4500.32", node(-4500.32)],
          ["-1e18", node(-1, 18)],
          ["-0.5eth", node(-0.5, 18, undefined, "-0.5eth")],
          ["-50s", node(-50, undefined, "s")],
          [
            "1000e18/mo",
            { ...node(1000, 18, "mo", "1000e18/mo"), perTime: true },
          ],
          ["50/s", { ...node(50, undefined, "s", "50/s"), perTime: true }],
          ["0.5eth/d", { ...node(0.5, 18, "d", "0.5eth/d"), perTime: true }],
        ];

        runCases(cases, numberParser());
      });

      it("should fail when a minus sign is not followed by digits", () => {
        const res = runParser(numberParser(), "-abc");
        expect(res).to.be.a("string");
      });

      it("should fail when parsing an incomplete decimal", () => {
        runErrorCase(
          numberParser(),
          "123.e18",
          errorType,
          "Invalid number: expected digits after the decimal point (e.g. 1.5)",
        );
      });

      it("should fail when parsing an incomplete exponent", () => {
        () => {
          runErrorCase(
            numberParser(),
            "123.2ew",
            errorType,
            'Invalid number: expected digits after "e" (e.g. 15e18)',
          );
        };
      });

      it("should fail when parsing an invalid time unit", () => {
        runErrorCase(
          numberParser(),
          "123.45e13w34",
          errorType,
          "Invalid time unit. Valid units: s, m, h, d, w, mo, y (e.g. 30m, 2d)",
        );
      });

      it("should fail when a rate literal has no time unit after the slash", () => {
        runErrorCase(
          numberParser(),
          "1000e18/x",
          errorType,
          'Invalid rate: expected a time unit after "/" (e.g. 1000e18/mo)',
        );
      });
    });

    describe("when parsing string values", () => {
      it("should parse quoted strings", () => {
        const node = (value: string): StringLiteralNode => {
          const n: StringLiteralNode = {
            type: NodeType.StringLiteral,
            value,
            loc: {
              start: {
                line: 1,
                col: 0,
              },
              end: {
                line: 1,
                col: value.length + 2,
              },
            },
          };
          return n;
        };

        const cases: Case[] = [
          [`'a test single quote string'`, node("a test single quote string")],
          [`"a test double quote string"`, node("a test double quote string")],
          [`'alpha (with beta) ? --'`, node("alpha (with beta) ? --")],
        ];

        runCases(cases, stringParser());
      });

      it("should unescape recognized backslash escapes", () => {
        const cases: Array<[string, string, number]> = [
          [`'it\\'s a test'`, "it's a test", 14],
          [`"say \\"hi\\""`, 'say "hi"', 12],
          [`"a\\\\b"`, "a\\b", 6],
          [`"line1\\nline2"`, "line1\nline2", 14],
          [`"tab\\there"`, "tab\there", 11],
          [`"cr\\rhere"`, "cr\rhere", 10],
          [`"\\u{1F600}"`, String.fromCodePoint(0x1f600), 11],
        ];

        for (const [input, value, sourceLen] of cases) {
          const result = runParser(stringParser(), input);
          expect(result).to.deep.include({
            type: NodeType.StringLiteral,
            value,
          });
          expect(result.loc).to.eql({
            start: { line: 1, col: 0 },
            end: { line: 1, col: sourceLen },
          });
        }
      });

      it("should leave unknown backslash sequences literal", () => {
        const result = runParser(stringParser(), `"C:\\Users"`);
        expect(result).to.deep.include({
          type: NodeType.StringLiteral,
          value: "C:\\Users",
        });
      });

      it("should not bump source line for inline \\n escapes", () => {
        const result = runParser(stringParser(), '"line1\\nline2"');
        expect(result.loc).to.eql({
          start: { line: 1, col: 0 },
          end: { line: 1, col: 14 },
        });
      });
    });

    it("should fail when parsing an invalid string", () => {
      runErrorCase(
        stringParser(),
        '"asdadasdasd',
        STRING_PARSER_ERROR,
        "Expected a quoted string — did you forget the closing quote?",
      );
    });

    describe("when parsing multi-line strings", () => {
      it("should preserve newlines inside the string value", () => {
        const result = runParser(stringParser(), '"hello\nworld"');
        expect(result).to.deep.include({
          type: NodeType.StringLiteral,
          value: "hello\nworld",
        });
        expect(result.loc).to.eql({
          start: { line: 1, col: 0 },
          end: { line: 2, col: 6 },
        });
      });

      it("should advance line/col so subsequent tokens have correct loc", () => {
        const result = runParser(arrayExpressionParser, '["a\nb" 42]');
        expect(result.elements).to.have.lengthOf(2);
        expect(result.elements[0]).to.deep.include({
          type: NodeType.StringLiteral,
          value: "a\nb",
        });
        expect(result.elements[0].loc).to.eql({
          start: { line: 1, col: 1 },
          end: { line: 2, col: 2 },
        });
        expect(result.elements[1]).to.deep.include({
          type: NodeType.NumberLiteral,
          value: "42",
        });
        expect(result.elements[1].loc).to.eql({
          start: { line: 2, col: 3 },
          end: { line: 2, col: 5 },
        });
      });
    });

    describe("when parsing heredoc values", () => {
      it("should parse a <<<SOL heredoc into a raw string with the sentinel flag", () => {
        const result = runParser(
          heredocParser(),
          "<<<SOL\npragma solidity 0.8.26;\ncontract A {}\nSOL",
        );
        expect(result).to.deep.include({
          type: NodeType.StringLiteral,
          value: "pragma solidity 0.8.26;\ncontract A {}",
          heredoc: "SOL",
        });
      });

      it("should accept any uppercase sentinel and an empty body", () => {
        const result = runParser(heredocParser(), '<<<JSON\n{"a": 1}\nJSON');
        expect(result).to.deep.include({
          value: '{"a": 1}',
          heredoc: "JSON",
        });
        const empty = runParser(heredocParser(), "<<<TXT\nTXT");
        expect(empty).to.deep.include({ value: "", heredoc: "TXT" });
      });

      it("should not process escape sequences (raw content)", () => {
        const result = runParser(heredocParser(), "<<<TXT\na\\nb\nTXT");
        expect(result.value).to.equal("a\\nb");
      });

      it("should not close on lines merely starting with the sentinel", () => {
        const result = runParser(
          heredocParser(),
          "<<<SOL\nSOLIDITY rocks\nSOL",
        );
        expect(result.value).to.equal("SOLIDITY rocks");
      });

      it("should advance line/col so subsequent tokens have correct loc", () => {
        const result = runParser(
          arrayExpressionParser,
          "<<<TXT\na\nb\nTXT 42]".replace("<<<", "[<<<"),
        );
        expect(result.elements).to.have.lengthOf(2);
        expect(result.elements[0]).to.deep.include({
          type: NodeType.StringLiteral,
          value: "a\nb",
        });
        expect(result.elements[0].loc).to.eql({
          start: { line: 1, col: 1 },
          end: { line: 4, col: 3 },
        });
        expect(result.elements[1].loc).to.eql({
          start: { line: 4, col: 4 },
          end: { line: 4, col: 6 },
        });
      });

      it("should fail on an unterminated heredoc instead of falling back to a bareword", () => {
        runErrorCase(
          heredocParser(),
          "<<<SOL\ncontract A {}",
          HEREDOC_PARSER_ERROR,
          "Expected a terminated heredoc — close <<<TAG with a line containing only TAG",
        );
      });
    });
  });

  describe("when parsing identifiers", () => {
    it("should parse probable identifier values", () => {
      const node = (value: string): BarewordNode => {
        const n: BarewordNode = {
          type: NodeType.Bareword,
          value,
          loc: {
            start: {
              line: 1,
              col: 0,
            },
            end: {
              line: 1,
              col: value.length,
            },
          },
        };

        return n;
      };

      [
        "new",
        "install",
        "aNewAgent",
        "create-flow",
        "create-super-flow-xtreme-aa",
        "my-ens-name.eth",
        "agent.open.0",
        "superfluid-app.other-open:20",
        "2015-20-09",
        "aSIgnature(with,some,params)",
        "noParamSignature()",
      ].forEach((value) =>
        expect(runParser(barewordParser(), value)).to.eql(node(value)),
      );
    });

    it("fail when parsing an invalid identifier", () => {
      runErrorCase(
        barewordParser(),
        "asd([[))",
        BAREWORD_PARSER_ERROR,
        "Expected an identifier (a bare word like token-manager)",
      );
    });

    it("should parse variable values", () => {
      const n = (value: string): VariableIdentifierNode => ({
        type: NodeType.VariableIdentifier,
        value,
        loc: buildLocation(value),
      });
      const cases: Case[] = [
        ["$variable", n("$variable")],
        ["$aCamelCaseVariable", n("$aCamelCaseVariable")],
        ["$a-snake-case-variable", n("$a-snake-case-variable")],
        ["$token-manager.open:0", n("$token-manager.open:0")],
      ];

      runCases(cases, variableIdentifierParser());
    });

    it("should fail when parsing invalid variables", () => {
      runErrorCase(
        variableIdentifierParser(),
        "$asd/()",
        VARIABLE_PARSER_ERROR,
        'Expected a variable: "$" followed by a name (e.g. $myToken)',
      );
    });
  });
});

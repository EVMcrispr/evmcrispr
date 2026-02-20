import { beforeAll, describe, it } from "bun:test";
import "../../setup.js";

import type { NumericLiteralNode } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  ExpressionError,
  NodeType,
  Num,
  timeUnits,
} from "@evmcrispr/sdk";
import {
  createInterpreter,
  expectThrowAsync,
  getPublicClient,
  type InterpreterCase,
  runInterpreterCases,
} from "@evmcrispr/test-utils";
import { expect } from "chai";
import type { PublicClient } from "viem";

describe("Interpreter - primaries", async () => {
  let client: PublicClient;
  const getClient = async () => client;

  beforeAll(async () => {
    client = getPublicClient();
  });
  describe("when interpreting a literal node", () => {
    it("should interpret address node correctly", async () => {
      const c: InterpreterCase = [
        {
          type: NodeType.AddressLiteral,
          value: "0x83E57888cd55C3ea1cfbf0114C963564d81e318d",
        },
        "0x83E57888cd55C3ea1cfbf0114C963564d81e318d",
      ];

      await runInterpreterCases(c, getClient);
    });

    it("should interpret a boolean node correctly", async () => {
      const cases: InterpreterCase[] = [
        [
          {
            type: NodeType.BoolLiteral,
            value: false,
          },
          false,
        ],
        [{ type: NodeType.BoolLiteral, value: true }, true],
      ];

      await runInterpreterCases(cases, getClient);
    });

    it("should intepret a bytes node correctly", async () => {
      const cases: InterpreterCase[] = [
        [
          {
            type: NodeType.BytesLiteral,
            value:
              "0x0e80f0b30000000000000000000000008e6cd950ad6ba651f6dd608dc70e5886b1aa6b240000000000000000000000002f00df4f995451e0df337b91744006eb8892bfb10000000000000000000000000000000000000000000000004563918244f40000",
          },
          "0x0e80f0b30000000000000000000000008e6cd950ad6ba651f6dd608dc70e5886b1aa6b240000000000000000000000002f00df4f995451e0df337b91744006eb8892bfb10000000000000000000000000000000000000000000000004563918244f40000",
        ],
      ];

      await runInterpreterCases(cases, getClient);
    });

    it("should intepret a numeric node correctly", async () => {
      const toNum = (
        value: number | string,
        power?: number,
        timeUnit?: string,
      ): Num => {
        let r = Num.fromDecimalString(String(value));
        if (power) {
          r = r.mul(new Num(10n ** BigInt(power), 1n));
        }
        r = r.mul(Num.fromBigInt(BigInt(timeUnits[timeUnit ?? "s"])));
        return r;
      };

      const node = (
        value: number,
        power?: number,
        timeUnit?: string,
      ): NumericLiteralNode => {
        const n: NumericLiteralNode = {
          type: NodeType.NumberLiteral,
          value: String(value),
        };
        if (power) n.power = power;
        if (timeUnit) n.timeUnit = timeUnit;

        return n;
      };

      const cases: InterpreterCase[] = [
        [node(15), toNum(15), "Invalid integer number match"],
        [
          node(1500, 18),
          toNum(1500, 18),
          "Invalid integer number raised to a power match",
        ],
        [
          node(7854.2345),
          toNum(7854.2345),
          "Invalid decimal number raised to a power match",
        ],
        [
          node(0.000123, 14),
          toNum(0.000123, 14),
          "Invalid zero decimal number raised to a power match ",
        ],
        [
          node(1200.12, 18, "mo"),
          toNum(1200.12, 18, "mo"),
          "Invalid decimal number raised to a power followed by time unit match",
        ],
        [
          node(30, undefined, "s"),
          toNum(30, undefined, "s"),
          "Invalid number followed by second time unit match",
        ],
        [
          node(5, undefined, "m"),
          toNum(5, undefined, "m"),
          "Invalid number followed by minute time unit match",
        ],
        [
          node(35, undefined, "h"),
          toNum(35, undefined, "h"),
          "Invalid number followed by hour time unit match",
        ],
        [
          node(463, undefined, "d"),
          toNum(463, undefined, "d"),
          "Invalid number followed by day time unit match",
        ],
        [
          node(96, undefined, "w"),
          toNum(96, undefined, "w"),
          "Invalid number followed by week time unit match",
        ],
        [
          node(9, undefined, "mo"),
          toNum(9, undefined, "mo"),
          "Invalid number followed by month time unit match",
        ],
        [
          node(4.67, undefined, "y"),
          toNum(4.67, undefined, "y"),
          "Invalid number followed by year time unit match",
        ],
      ];

      await runInterpreterCases(cases, getClient);
    });

    it("should intepret a string node correctly", async () => {
      const cases: InterpreterCase[] = [
        [
          {
            type: NodeType.StringLiteral,
            value: "This is a string node",
          },
          "This is a string node",
        ],
      ];

      await runInterpreterCases(cases, getClient);
    });
  });

  describe("when intepreting an identifier node", () => {
    it("should intepret a bareword correctly (always returns string)", async () => {
      const cases: InterpreterCase[] = [
        [
          {
            type: NodeType.Bareword,
            value: "token-manager.open:3",
          },
          "token-manager.open:3",
        ],
        [
          {
            type: NodeType.Bareword,
            value: "ETH",
          },
          "ETH",
        ],
      ];

      await runInterpreterCases(cases, getClient);
    });
    it("should interpret a variable correctly", async () => {
      const interpreter = createInterpreter(`set $myVar 42`, client);
      await interpreter.interpret();
      const value = interpreter.getBinding("$myVar", BindingsSpace.USER);
      expect(value).to.be.instanceOf(Num);
      expect((value as Num).eq(Num.fromBigInt(42n))).to.be.true;
    });

    it("should fail when intepreting a non-existent variable", async () => {
      const interpreter = createInterpreter(`set $a $nonExistent`, client);
      const node = interpreter.ast.body[0].args[1];
      const err = new ExpressionError(node, "$nonExistent not defined", {
        name: "VariableIdentifierError",
      });
      await expectThrowAsync(() => interpreter.interpret(), err);
    });
  });
});

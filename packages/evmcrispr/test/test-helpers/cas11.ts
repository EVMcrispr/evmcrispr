import type { Err, Parser } from "arcsecond";
import { withData } from "arcsecond";
import { expect } from "chai";

import type { PublicClient } from "viem";

import { inspect } from "util";
import type { ErrorException } from "../../src";
import { Cas11AST } from "../../src";
import { EVMcrispr } from "../../src/EVMcrispr";
import { scriptParser } from "../../src/parsers/script";
import { createParserState } from "../../src/parsers/utils";
import type {
  BlockExpressionNode,
  CommandExpressionNode,
  HelperFunctionNode,
  Node,
  NodeParser,
  NodeParserState,
} from "../../src/types";
import { BindingsSpace, NodeType } from "../../src/types";
import type { Comparison } from "../../src/utils";
import { ComparisonType, buildArgsLengthErrorMsg } from "../../src/utils";
import { buildParserError } from "../../src/utils/parsers";
import {
  CommandError,
  ExpressionError,
  HelperFunctionError,
} from "../../src/errors";
import { expectThrowAsync } from "./expects";
import { TEST_ACCOUNT_ADDRESS } from "./constants";

const { CommandExpression } = NodeType;
const { Between, Equal, Greater } = ComparisonType;

export type Case = [string, any, string?];

export type InterpreterCase = [Node, any, string?];
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const deepConsoleLog = (thing: any): void =>
  console.log(inspect(thing, false, null, true));

export const runParser = (
  parser: Parser<any, string, any>,
  value: string,
): any => {
  const res = withData<any, string, NodeParserState>(parser)(
    createParserState(),
  ).run(value);

  if (res.isError) {
    return res.error;
  }

  return res.result;
};

export const runCases = (
  caseOrCases: Case | Case[],
  parser: Parser<any, string, any>,
): void =>
  (Array.isArray(caseOrCases[0]) ? caseOrCases : [caseOrCases]).forEach(
    ([value, expected, errorMsg]) =>
      expect(runParser(parser, value), errorMsg).eql(expected),
  );

export const runInterpreterCases = async (
  caseOrCases: InterpreterCase | InterpreterCase[],
  getClient: () => Promise<PublicClient>,
): Promise<void[]> =>
  Promise.all(
    (Array.isArray(caseOrCases[0]) ? caseOrCases : [caseOrCases]).map(
      async ([node, expected, errorMsg]) => {
        const [res] = await new EVMcrispr(
          new Cas11AST([node]),
          getClient,
          async () => TEST_ACCOUNT_ADDRESS,
        ).interpret();

        expect(res, errorMsg).to.equal(expected);
      },
    ),
  );

export const runErrorCase = (
  parser: NodeParser,
  text: string,
  errType: string,
  errMsg?: string,
): void => {
  const parserState = createParserState();
  const res = withData<any, string, NodeParserState>(parser)(parserState).run(
    text,
  );

  expect(res.isError, "error not thrown").to.be.true;
  expect(
    (res as Err<string, NodeParserState>).error,
    "error message mismatch",
  ).to.equals(
    buildParserError(
      {
        index: res.index,
        error: (res as Err<string, NodeParserState>).error,
        data: parserState,
      } as Err<string, any>,
      errType,
      errMsg,
    ),
  );
};
export const createInterpreter = (
  script: string,
  client: PublicClient,
): EVMcrispr => {
  const ast = runParser(scriptParser, script) as Cas11AST;

  return new EVMcrispr(
    ast,
    async () => client,
    async () => TEST_ACCOUNT_ADDRESS,
  );
};

export const preparingExpression = async (
  expression: string,
  client: PublicClient,
  module?: string,
  configSetters: string[] = [],
): Promise<[Awaited<any>, HelperFunctionNode]> => {
  const i = createInterpreter(
    `
  ${module ? `load ${module}` : ""}

  ${configSetters.join("\n")}
  set $res ${expression}
  `,
    client,
  );

  const setCommand = i.ast.body.find(
    (n) => (n as CommandExpressionNode).name === "set",
  )! as CommandExpressionNode;
  const n = setCommand.args[1] as HelperFunctionNode;

  return [
    async () => {
      await i.interpret();
      return i.getBinding("$res", BindingsSpace.USER);
    },
    n,
  ];
};

const plural = (length: number): string => (length > 1 ? "s" : "");

const updateExpressionArgs = (
  op: "add" | "remove",
  argumentlessExpression: string,
  args: string[],
  { minValue, type }: Comparison,
): string => {
  switch (op) {
    case "add":
      return `${argumentlessExpression}(${[...args, `'extra argument'`].join(
        ",",
      )})`;
    case "remove":
      return `${argumentlessExpression}(${args
        .slice(
          0,
          Math.max(0, type === Between ? minValue - 1 : args.length - 1),
        )
        .join(",")})`;
    default:
      throw new Error("Unsupported update expression operation");
  }
};

const getCallee = (argumentlessExpression: string): string => {
  if (argumentlessExpression.startsWith("@")) {
    return argumentlessExpression.slice(1);
  } else if (argumentlessExpression.includes("::")) {
    return argumentlessExpression.split("::")[1];
  } else {
    return argumentlessExpression;
  }
};

const createCommandNode = (name: string): CommandExpressionNode => ({
  type: CommandExpression,
  name: name,
  module: "",
  args: [],
  opts: [],
});

// const createHelperNode = (name: string): HelperFunctionNode => ({
//   type: HelperFunctionExpression,
//   name: name,
//   args: [],
// });

export const itChecksInvalidArgsLength = (
  expressionType: NodeType,
  argumentlessExpression: string,
  args: string[],
  c: Comparison,
  lazyClient: () => PublicClient,
  module?: string,
): Mocha.Test => {
  const { type, minValue, maxValue } = c;
  return it("should fail when receiving an invalid number of arguments", async () => {
    /**
     * When calling the 'it' outter fn none of the 'before' statements have been executed
     * so the signer hasn't been defined yet. To solve this, we pass a callback returning
     * the signer
     */
    const client = lazyClient();
    const callee = getCallee(argumentlessExpression);
    let error: ErrorException;
    let msg: string;

    if (type === Equal || type === Between) {
      const upperValue = maxValue ?? minValue;

      msg = buildArgsLengthErrorMsg(args.length + 1, c);
      const [interpret, h] = await preparingExpression(
        updateExpressionArgs("add", argumentlessExpression, args, c),
        client,
        module,
      );
      error =
        expressionType === CommandExpression
          ? new CommandError(createCommandNode(callee), msg)
          : new HelperFunctionError(h, msg);

      await expectThrowAsync(
        () => interpret(),
        error,
        `invalid result when passing more than ${upperValue} argument${plural(
          upperValue,
        )}`,
      );

      if (minValue > 0) {
        msg = buildArgsLengthErrorMsg(minValue - 1, c);
        const [interpret, h] = await preparingExpression(
          updateExpressionArgs("remove", argumentlessExpression, args, c),
          client,
          module,
        );
        error =
          expressionType === CommandExpression
            ? new CommandError(createCommandNode(callee), msg)
            : new HelperFunctionError(h, msg);

        await expectThrowAsync(
          () => interpret(),
          error,
          `invalid result when passing less than ${minValue} argument${plural(
            minValue,
          )}`,
        );
      }
    } else if (type === Greater) {
      msg = buildArgsLengthErrorMsg(args.length - 1, c);
      const [interpret, h] = await preparingExpression(
        updateExpressionArgs("remove", argumentlessExpression, args, c),
        client,
        module,
      );
      error =
        expressionType === CommandExpression
          ? new CommandError(createCommandNode(callee), msg)
          : new HelperFunctionError(h, msg);

      await expectThrowAsync(
        () => interpret(),
        error,
        `invalid result when passing less than ${minValue} argument${plural(
          minValue,
        )}`,
      );
    }
  });
};

export const itChecksNonDefinedIdentifier = (
  itName: string,
  createInterpreter: (nonDefinedIdentifier: string) => EVMcrispr,
  commandName: string,
  argIndex: number,
  isAragonOS = false,
): Mocha.Test => {
  return it(itName, async () => {
    const nonDefinedIdentifier = "non-defined-address";
    const interpreter = createInterpreter(nonDefinedIdentifier);
    let body = interpreter.ast.body;
    if (isAragonOS) {
      const connect = body.find((c) => c.name === "connect")!;
      body = (connect.args[connect.args.length - 1] as BlockExpressionNode)
        .body;
    }
    const c = body.find((n) => n.name === commandName);

    if (!c) {
      throw new Error("Command not found");
    }

    const error = new ExpressionError(
      c.args[argIndex],
      `identifier "${nonDefinedIdentifier}" not found`,
      { name: "IdentifierError" },
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
};

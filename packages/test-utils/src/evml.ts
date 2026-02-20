import { it } from "bun:test";
import { inspect } from "node:util";
import type { EvmlAST } from "@evmcrispr/core";
import { createParserState, EVMcrispr, parseScript } from "@evmcrispr/core";
import type {
  Action,
  CommandExpressionNode,
  Comparison,
  ErrorException,
  HelperFunctionNode,
  Node,
  NodeParser,
  NodeParserState,
} from "@evmcrispr/sdk";
import {
  BindingsSpace,
  buildArgsLengthErrorMsg,
  buildParserError,
  CommandError,
  ComparisonType,
  HelperFunctionError,
  NodeType,
  Num,
} from "@evmcrispr/sdk";
import type { Err, Parser } from "arcsecond";
import { withData } from "arcsecond";
import { expect } from "chai";
import type { PublicClient } from "viem";
import { getTransports } from "./client";
import { TEST_ACCOUNT_ADDRESS } from "./constants";
import { expectThrowAsync } from "./expects";

const { CommandExpression } = NodeType;
const { Between, Equal, Greater } = ComparisonType;

export type Case = [string, any, string?];

export type InterpreterCase = [Node, any, string?];

export interface TestInterpreter {
  ast: EvmlAST;
  script: string;
  evm: EVMcrispr;
  interpret(): Promise<Action[]>;
  getBinding: EVMcrispr["getBinding"];
  getModule: EVMcrispr["getModule"];
  getAllModules: EVMcrispr["getAllModules"];
  registerLogListener: EVMcrispr["registerLogListener"];
  bindingsManager: EVMcrispr["bindingsManager"];
}

export const deepConsoleLog = (thing: any): void =>
  console.log(inspect(thing, false, null, true));

export const runParser = (
  parser: Parser<any, string, any>,
  value: string,
  customCreateParserState?: () => NodeParserState,
): any => {
  const stateFn = customCreateParserState ?? createParserState;
  const res = withData<any, string, NodeParserState>(parser)(stateFn()).run(
    value,
  );

  if (res.isError) {
    return res.error;
  }

  return res.result;
};

export const runCases = (
  caseOrCases: Case | Case[],
  parser: Parser<any, string, any>,
  customCreateParserState?: () => NodeParserState,
): void =>
  (Array.isArray(caseOrCases[0]) ? caseOrCases : [caseOrCases]).forEach(
    ([value, expected, errorMsg]) =>
      expect(runParser(parser, value, customCreateParserState), errorMsg).eql(
        expected,
      ),
  );

export const runInterpreterCases = async (
  caseOrCases: InterpreterCase | InterpreterCase[],
  getClient: () => Promise<PublicClient>,
): Promise<void[]> =>
  Promise.all(
    (Array.isArray(caseOrCases[0]) ? caseOrCases : [caseOrCases]).map(
      async ([node, expected, errorMsg]) => {
        const client = await getClient();
        const evm = new EVMcrispr(
          client,
          TEST_ACCOUNT_ADDRESS,
          getTransports(),
        );
        const res = await evm.interpretNode(node);
        if (res instanceof Num && expected instanceof Num) {
          expect(res.eq(expected), errorMsg).to.be.true;
        } else {
          expect(res, errorMsg).to.equal(expected);
        }
      },
    ),
  );

export const runErrorCase = (
  parser: NodeParser,
  text: string,
  errType: string,
  errMsgOrCreateParserState?: string | (() => NodeParserState),
  errMsg?: string,
): void => {
  let stateFn: () => NodeParserState;
  let finalErrMsg: string | undefined;

  if (typeof errMsgOrCreateParserState === "function") {
    stateFn = errMsgOrCreateParserState;
    finalErrMsg = errMsg;
  } else {
    stateFn = createParserState;
    finalErrMsg = errMsgOrCreateParserState;
  }
  const parserState = stateFn();
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
      finalErrMsg,
    ),
  );
};

export const createInterpreter = (
  script: string,
  client: PublicClient,
): TestInterpreter => {
  const { ast } = parseScript(script);
  const evm = new EVMcrispr(client, TEST_ACCOUNT_ADDRESS, getTransports());

  return {
    ast,
    script,
    evm,
    interpret: () => evm.interpret(script),
    getBinding: evm.getBinding.bind(evm),
    getModule: evm.getModule.bind(evm),
    getAllModules: evm.getAllModules.bind(evm),
    registerLogListener: evm.registerLogListener.bind(evm),
    bindingsManager: evm.bindingsManager,
  };
};

export const preparingExpression = async (
  expression: string,
  client: PublicClient,
  module?: string,
  preamble = "",
): Promise<[Awaited<any>, HelperFunctionNode]> => {
  const script = `
  ${module ? `load ${module}` : ""}

  ${preamble}
  set $res ${expression}
  `;

  const i = createInterpreter(script, client);

  const setCommands = i.ast.body.filter(
    (n) => (n as CommandExpressionNode).name === "set",
  );
  const setCommand = setCommands[
    setCommands.length - 1
  ]! as CommandExpressionNode;
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

export const itChecksInvalidArgsLength = (
  expressionType: NodeType,
  argumentlessExpression: string,
  args: string[],
  c: Comparison,
  lazyClient: () => PublicClient,
  module?: string,
): void => {
  const { type, minValue, maxValue } = c;
  it("should fail when receiving an invalid number of arguments", async () => {
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
  createTestInterpreter: (nonDefinedIdentifier: string) => TestInterpreter,
  _commandName: string,
  _argIndex: number,
  _isAragonOS = false,
): void => {
  it(itName, async () => {
    const nonDefinedIdentifier = "non-defined-address";
    const interpreter = createTestInterpreter(nonDefinedIdentifier);

    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err).to.be.an.instanceOf(Error);
      expect(err.message).to.include(nonDefinedIdentifier);
    }
  });
};

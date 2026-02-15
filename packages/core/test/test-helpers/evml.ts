import { it } from "bun:test";
import { inspect } from "node:util";
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
} from "@evmcrispr/sdk";
import type { Err, Parser } from "arcsecond";
import { withData } from "arcsecond";
import { expect } from "chai";
import type { PublicClient } from "viem";
import { EVMcrispr } from "../../src/EVMcrispr";
import type { EvmlAST } from "../../src/EvmlAST";
import { parseScript } from "../../src/parsers/script";
import { createParserState } from "../../src/parsers/utils";
import { TEST_ACCOUNT_ADDRESS } from "./constants";
import { expectThrowAsync } from "./expects";

const { CommandExpression } = NodeType;
const { Between, Equal, Greater } = ComparisonType;

export type Case = [string, any, string?];

export type InterpreterCase = [Node, any, string?];

/**
 * Wrapper returned by `createInterpreter` that provides the old test-facing
 * interface (`.ast`, `.interpret()`, `.getBinding()`, etc.) on top of the
 * new `EVMcrispr` API which accepts script strings.
 */
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
        const client = await getClient();
        const evm = new EVMcrispr(client, TEST_ACCOUNT_ADDRESS);
        const res = await evm.interpretNode(node);
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
): TestInterpreter => {
  const { ast } = parseScript(script);
  const evm = new EVMcrispr(client, TEST_ACCOUNT_ADDRESS);

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
  configSetters: string[] = [],
): Promise<[Awaited<any>, HelperFunctionNode]> => {
  const script = `
  ${module ? `load ${module}` : ""}

  ${configSetters.join("\n")}
  set $res ${expression}
  `;

  const i = createInterpreter(script, client);

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
): void => {
  const { type, minValue, maxValue } = c;
  it("should fail when receiving an invalid number of arguments", async () => {
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

/**
 * With barewords always returning their string value, passing a non-defined
 * identifier where an address is expected produces a CommandError from
 * type validation (not an IdentifierError from the interpreter).
 */
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

    // The bareword is interpreted as the string "non-defined-address" which
    // then fails address validation at the command level.
    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err).to.be.an.instanceOf(Error);
      // The error message should mention the non-defined identifier somewhere
      expect(err.message).to.include(nonDefinedIdentifier);
    }
  });
};

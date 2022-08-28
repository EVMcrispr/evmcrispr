import type { Err, Parser } from 'arcsecond';
import { withData } from 'arcsecond';
import { expect } from 'chai';
import type { Signer } from 'ethers';

import { inspect } from 'util';
import type { ErrorException } from '../../src';
import { BindingsSpace } from '../../src/cas11/interpreter/BindingsManager';
import { Interpreter } from '../../src/cas11/interpreter/Interpreter';
import { scriptParser } from '../../src/cas11/parsers/script';
import type { NodeParserState } from '../../src/cas11/parsers/utils';
import { createParserState } from '../../src/cas11/parsers/utils';
import type { AST, Node, NodeParser } from '../../src/cas11/types';
import { ASTType, NodeType } from '../../src/cas11/types';
import type { Comparison } from '../../src/cas11/utils';
import { ComparisonType, buildArgsLengthErrorMsg } from '../../src/cas11/utils';
import { buildParserError } from '../../src/cas11/utils/parsers';
import {
  CommandError,
  ExpressionError,
  HelperFunctionError,
} from '../../src/errors';
import { expectThrowAsync } from './expects';

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
  signer: Signer,
): Promise<void[]> =>
  Promise.all(
    (Array.isArray(caseOrCases[0]) ? caseOrCases : [caseOrCases]).map(
      async ([node, expected, errorMsg]) => {
        const ast: AST = {
          type: ASTType.Program,
          body: [node],
        };
        const [res] = await new Interpreter(ast, signer).interpret();

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
  const res = withData<any, string, NodeParserState>(parser)(
    createParserState(),
  ).run(text);

  expect(res.isError, 'error not thrown').to.be.true;
  expect(
    (res as Err<string, NodeParserState>).error,
    'error message mismatch',
  ).to.equals(
    buildParserError(
      {
        index: res.index,
        error: (res as Err<string, NodeParserState>).error,
      } as Err<string, any>,
      errType,
      errMsg,
    ),
  );
};
export const createInterpreter = (
  script: string,
  signer: Signer,
): Interpreter => {
  const ast = runParser(scriptParser, script) as AST;

  return new Interpreter(ast, signer);
};

export const runExpression = async (
  helper: string,
  signer: Signer,
  module?: string,
  configSetters: string[] = [],
): Promise<string> => {
  const i = createInterpreter(
    `
  ${module ? `load ${module}` : ''}

  ${configSetters.join('\n')}
  set $res ${helper}
  `,
    signer,
  );

  await i.interpret();

  return i.getBinding('$res', BindingsSpace.USER);
};

const plural = (length: number): string => (length > 1 ? 's' : '');

const updateExpressionArgs = (
  op: 'add' | 'remove',
  argumentlessExpression: string,
  args: string[],
  { minValue, type }: Comparison,
): string => {
  switch (op) {
    case 'add':
      return `${argumentlessExpression}(${[...args, `'extra argument'`].join(
        ',',
      )})`;

    // x = max - min + 1    2 - 1 + 1
    // max - x  = min - 1
    case 'remove':
      return `${argumentlessExpression}(${args
        .slice(
          0,
          Math.max(0, type === Between ? minValue - 1 : args.length - 1),
        )
        .join(',')})`;
    default:
      throw new Error('Unsupported update expression operation');
  }
};

const getCallee = (argumentlessExpression: string): string => {
  if (argumentlessExpression.startsWith('@')) {
    return argumentlessExpression.slice(1);
  } else if (argumentlessExpression.includes('::')) {
    return argumentlessExpression.split('::')[1];
  } else {
    return argumentlessExpression;
  }
};

export const itChecksInvalidArgsLength = (
  expressionType: NodeType,
  argumentlessExpression: string,
  args: string[],
  c: Comparison,
  lazySigner: () => Signer,
  module?: string,
): Mocha.Test => {
  const { type, minValue, maxValue } = c;
  return it('should fail when receiving an invalid number of arguments', async () => {
    /**
     * When calling the 'it' outter fn none of the 'before' statements have been executed
     * so the signer hasn't been defined yet. To solve this, we pass a callback returning
     * the signer
     */
    const signer = lazySigner();
    const callee = getCallee(argumentlessExpression);
    let error: ErrorException;
    let msg: string;

    if (type === Equal || type === Between) {
      const upperValue = maxValue ?? minValue;

      msg = buildArgsLengthErrorMsg(args.length + 1, c);
      error =
        expressionType === CommandExpression
          ? new CommandError(callee, msg)
          : new HelperFunctionError(callee, msg);

      await expectThrowAsync(
        () =>
          runExpression(
            updateExpressionArgs('add', argumentlessExpression, args, c),
            signer,
            module,
          ),
        {
          type: error.constructor,
          message: error.message,
        },
        `invalid result when passing more than ${upperValue} argument${plural(
          upperValue,
        )}`,
      );

      if (minValue > 0) {
        msg = buildArgsLengthErrorMsg(minValue - 1, c);
        error =
          expressionType === CommandExpression
            ? new CommandError(callee, msg)
            : new HelperFunctionError(callee, msg);

        await expectThrowAsync(
          () =>
            runExpression(
              updateExpressionArgs('remove', argumentlessExpression, args, c),
              signer,
              module,
            ),
          {
            type: error.constructor,
            message: error.message,
          },
          `invalid result when passing less than ${minValue} argument${plural(
            minValue,
          )}`,
        );
      }
    } else if (type === Greater) {
      msg = buildArgsLengthErrorMsg(args.length - 1, c);
      error =
        expressionType === CommandExpression
          ? new CommandError(callee, msg)
          : new HelperFunctionError(callee, msg);

      await expectThrowAsync(
        () =>
          runExpression(
            updateExpressionArgs('remove', argumentlessExpression, args, c),
            signer,
            module,
          ),
        {
          type: error.constructor,
          message: error.message,
        },
        `invalid result when passing less than ${minValue} argument${plural(
          minValue,
        )}`,
      );
    }
  });
};

export const itChecksNonDefinedIdentifier = (
  itName: string,
  createInterpreter: (nonDefinedIdentifier: string) => Interpreter,
): Mocha.Test => {
  return it(itName, async () => {
    const nonDefinedIdentifier = 'non-defined-address';
    const error = new ExpressionError(
      `identifier "${nonDefinedIdentifier}" not found`,
      { name: 'IdentifierError' },
    );

    await expectThrowAsync(
      () => createInterpreter(nonDefinedIdentifier).interpret(),
      {
        type: error.constructor,
        message: error.message,
      },
    );
  });
};

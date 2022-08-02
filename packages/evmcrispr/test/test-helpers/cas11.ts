import type { Parser } from 'arcsecond';
import { expect } from 'chai';
import type { Signer } from 'ethers';

import { inspect } from 'util';
import { ErrorInvalid } from '../../src';
import { Interpreter } from '../../src/cas11/interpreter/Interpreter';
import { scriptParser } from '../../src/cas11/parsers/script';
import type { AST, Node } from '../../src/cas11/types';
import { ASTType } from '../../src/cas11/types';
import type { CallableExpression, Comparison } from '../../src/cas11/utils';
import { ComparisonType, buildArgsLengthErrorMsg } from '../../src/cas11/utils';
import { expectThrowAsync } from './expects';

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
  const res = parser.run(value);

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
): Promise<string> => {
  const i = createInterpreter(`set $res ${helper}`, signer);
  // console.log(i.ast);
  await i.interpret();

  return i.getBinding('$res', true);
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

export const itChecksInvalidArgs = (
  expressionType: CallableExpression,
  argumentlessExpression: string,
  args: string[],
  c: Comparison,
  lazySigner: () => Signer,
): Mocha.Test => {
  const { type, minValue, maxValue } = c;
  return it('should fail when passing an invalid number of arguments', async () => {
    /**
     * When calling the 'it' outter fn none of the 'before' statements have been executed
     * so the signer hasn't been defined yet. To solve this, we pass a function that will be called
     * when the "it" is executed.
     */
    const signer = lazySigner();
    const callee = getCallee(argumentlessExpression);
    if (type === Equal || type === Between) {
      const upperValue = maxValue ?? minValue;

      await expectThrowAsync(
        () =>
          runExpression(
            updateExpressionArgs('add', argumentlessExpression, args, c),
            signer,
          ),
        {
          type: ErrorInvalid,
          message: buildArgsLengthErrorMsg(
            callee,
            expressionType,
            args.length + 1,
            c,
          ),
        },
        `invalid result when passing more than ${upperValue} argument${plural(
          upperValue,
        )}`,
      );

      if (minValue > 0) {
        await expectThrowAsync(
          () =>
            runExpression(
              updateExpressionArgs('remove', argumentlessExpression, args, c),
              signer,
            ),
          {
            type: ErrorInvalid,
            message: buildArgsLengthErrorMsg(
              callee,
              expressionType,
              minValue - 1,
              c,
            ),
          },
          `invalid result when passing less than ${minValue} argument${plural(
            minValue,
          )}`,
        );
      }
    } else if (type === Greater) {
      await expectThrowAsync(
        () =>
          runExpression(
            updateExpressionArgs('remove', argumentlessExpression, args, c),
            signer,
          ),
        {
          type: ErrorInvalid,
          message: buildArgsLengthErrorMsg(
            callee,
            expressionType,
            args.length - 1,
            c,
          ),
        },
        `invalid result when passing less than ${minValue} argument${plural(
          minValue,
        )}`,
      );
    }
  });
};

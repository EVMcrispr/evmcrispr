import type { Parser } from 'arcsecond';
import { expect } from 'chai';

import { inspect } from 'util';
import { Interpreter } from '../../src/cas11/interpreter/Interpreter';
import type { AST, Node } from '../../src/cas11/types';
import { ASTType } from '../../src/cas11/types';

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
      expect(runParser(parser, value), errorMsg).to.deep.equal(expected),
  );

export const runInterpreterCases = async (
  caseOrCases: InterpreterCase | InterpreterCase[],
): Promise<void[]> =>
  Promise.all(
    (Array.isArray(caseOrCases[0]) ? caseOrCases : [caseOrCases]).map(
      async ([node, expected, errorMsg]) => {
        const ast: AST = {
          type: ASTType.Program,
          body: [node],
        };
        const [res] = await new Interpreter(ast).interpret();

        expect(res, errorMsg).to.equal(expected);
      },
    ),
  );

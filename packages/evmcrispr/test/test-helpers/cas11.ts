import type { Parser } from 'arcsecond';
import { expect } from 'chai';

import { inspect } from 'util';

export type Case = [string, any, string?];

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const deepConsoleLog = (thing: any): void =>
  console.log(inspect(thing, false, null, true));

export const runParser = (
  parser: Parser<any, string, any>,
  value: string,
): any => {
  const res = parser.run(value);

  if (res.isError) {
    console.log(res);
    return res.error;
  }

  return res.result;
};

export const runCases = (
  cases: Case[],
  parser: Parser<any, string, any>,
): void =>
  cases.forEach(([value, expected, errorMsg]) =>
    expect(runParser(parser, value), errorMsg).to.deep.equal(expected),
  );

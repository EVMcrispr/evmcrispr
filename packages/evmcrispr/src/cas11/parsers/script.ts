import type { Parser } from 'arcsecond';
import { coroutine, toValue } from 'arcsecond';

import { deepConsoleLog } from '../../../test/test-helpers/cas11';

import type { AST } from '../types';
import { ASTType } from '../types';
import { commandExpressionParser } from './command';
import { optionalEmptyLines } from './utils';

export const scriptParser: Parser<AST> = coroutine(function* () {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const lines = yield optionalEmptyLines(commandExpressionParser);
  return {
    type: ASTType.Program,
    body: lines,
  } as unknown as AST;
});

export const parseScript = (script: string): AST | undefined => {
  const res = scriptParser.run(script);

  deepConsoleLog(res);
  if (res.isError) {
    console.log(res.error);
    return;
  }

  return toValue(res);
};

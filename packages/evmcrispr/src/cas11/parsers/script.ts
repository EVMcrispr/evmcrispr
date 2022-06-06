import type { Parser } from 'arcsecond';
import { coroutine, toValue } from 'arcsecond';
import type { AST } from 'prettier';

import { deepConsoleLog } from '../../../test/test-helpers/cas11';

import { ASTType } from '../types';
import { commandExpressionParser } from './command';
import { optionalEmptyLines } from './utils';

export const scriptParser: Parser<AST> = coroutine(function* () {
  const lines = yield optionalEmptyLines(commandExpressionParser);
  return {
    type: ASTType.Program,
    body: lines,
  };
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

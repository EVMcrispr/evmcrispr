import type { Parser } from 'arcsecond';
import { choice, coroutine, many, toValue } from 'arcsecond';
import type { AST } from 'prettier';

import { ASTType } from '../types';
import { commandExpressionParser } from './command';
import { emptyLine } from './utils';

export const scriptParser: Parser<AST> = coroutine(function* () {
  const lines =
    (yield many(
      choice([emptyLine.map(() => null), commandExpressionParser]),
    )) ?? [];

  return {
    type: ASTType.Program,
    body: lines.filter((l: any) => l !== null),
  };
});

export const parseScript = (script: string): AST | undefined => {
  const res = scriptParser.run(script);

  if (res.isError) {
    console.log(res.error);
    return;
  }

  return toValue(res);
};

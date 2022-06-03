import type { Parser } from 'arcsecond';
import { choice, coroutine, many, toValue } from 'arcsecond';
import type { AST } from 'prettier';

import { inspect } from 'util';

import { ASTType } from '../types';
import { commandExpressionParser } from './command';
import { emptyLine } from './utils';

const print = (thing: any) => console.log(inspect(thing, false, null, true));

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
  console.log(print(scriptParser.run(script)));
  const res = scriptParser.run(script);

  if (res.isError) {
    console.log(res.error);
    return;
  }

  return toValue(res);
};

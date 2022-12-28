import { coroutine, setData } from 'arcsecond';
import type { Parser } from 'arcsecond';

import { Cas11AST } from '../Cas11AST';
import { ErrorException } from '../errors';
import type { CommandExpressionNode, NodeParserState } from '../types';
import { commandExpressionParser } from './command';
import { createParserState, linesParser } from './utils';

export const scriptParser: Parser<Cas11AST, string, NodeParserState> =
  coroutine(function* () {
    yield setData<any, string, NodeParserState>(createParserState());

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const lines = yield linesParser(commandExpressionParser);
    return new Cas11AST(lines as unknown as CommandExpressionNode[]);
  });

export const parseScript = (
  script: string,
): { ast: Cas11AST; errors: string[] } => {
  const res = scriptParser.run(script);

  if (res.isError) {
    throw new ErrorException(
      `An error occurred while parsing script: ${res.error}`,
    );
  }

  return {
    ast: res.result,
    errors: res.data.errors,
  };
};

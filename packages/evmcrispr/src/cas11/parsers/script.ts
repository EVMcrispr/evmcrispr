import { coroutine, setData } from 'arcsecond';
import type { Parser } from 'arcsecond';

import type { AST, NodeParserState } from '../types';
import { ASTType } from '../types';
import { commandExpressionParser } from './command';
import { createParserState, linesParser } from './utils';
import { ErrorException } from '../../../dist/1hive-evmcrispr.cjs';

export const scriptParser: Parser<AST, string, NodeParserState> = coroutine(
  function* () {
    yield setData<any, string, NodeParserState>(createParserState());

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const lines = yield linesParser(commandExpressionParser);
    return {
      type: ASTType.Program,
      body: lines,
    } as unknown as AST;
  },
);

export const parseScript = (script: string): { ast: AST; errors: string[] } => {
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

import { coroutine, setData } from 'arcsecond';
import type { Parser } from 'arcsecond';

import type { AST, NodeParserState } from '../types';
import { ASTType } from '../types';
import { commandExpressionParser } from './command';
import { createParserState, linesParser } from './utils';

export type ProgramParserData = {
  lines: number;
  line: number;
};
export const scriptParser: Parser<AST, string, ProgramParserData> = coroutine(
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

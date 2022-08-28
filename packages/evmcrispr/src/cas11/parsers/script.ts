import { coroutine, setData, toValue } from 'arcsecond';
import type { Parser } from 'arcsecond';

import { deepConsoleLog } from '../../../test/test-helpers/cas11';

import type { AST } from '../types';
import { ASTType } from '../types';
import { commandExpressionParser } from './command';
import type { NodeParserState } from './utils';
import { createParserState, optionalEmptyLines } from './utils';

export type ProgramParserData = {
  lines: number;
  line: number;
};
export const scriptParser: Parser<AST, string, ProgramParserData> = coroutine(
  function* () {
    yield setData<any, string, NodeParserState>(createParserState());

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const lines = yield optionalEmptyLines(commandExpressionParser);
    return {
      type: ASTType.Program,
      body: lines,
    } as unknown as AST;
  },
);

export const parseScript = (script: string): AST | undefined => {
  const res = scriptParser.run(script);

  deepConsoleLog(res);
  if (res.isError) {
    console.log(res.error);
    return;
  }

  return toValue(res);
};

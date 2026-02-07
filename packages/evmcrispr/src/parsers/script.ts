import type { Parser } from "arcsecond";
import { coroutine, setData } from "arcsecond";
import { Cas11AST } from "../Cas11AST";
import { ErrorException } from "../errors";
import type { CommandExpressionNode, NodeParserState } from "../types";
import { commandExpressionParser } from "./command";
import { createParserState, linesParser } from "./utils";

export const scriptParser: Parser<Cas11AST, string, NodeParserState> =
  coroutine((run) => {
    run(setData<any, string, NodeParserState>(createParserState()));
    const lines: CommandExpressionNode[] = run(
      linesParser(commandExpressionParser),
    );
    return new Cas11AST(lines);
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

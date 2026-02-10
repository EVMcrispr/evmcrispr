import type { CommandExpressionNode, NodeParserState } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { Parser } from "arcsecond";
import { coroutine, setData } from "arcsecond";
import { EvmlAST } from "../EvmlAST";
import { commandExpressionParser } from "./command";
import { createParserState, linesParser } from "./utils";

export const scriptParser: Parser<EvmlAST, string, NodeParserState> = coroutine(
  (run) => {
    run(setData<any, string, NodeParserState>(createParserState()));
    const lines: CommandExpressionNode[] = run(
      linesParser(commandExpressionParser),
    );
    return new EvmlAST(lines);
  },
);

export const parseScript = (
  script: string,
): { ast: EvmlAST; errors: string[] } => {
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

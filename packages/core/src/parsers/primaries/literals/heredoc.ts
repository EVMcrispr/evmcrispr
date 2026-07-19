import type {
  EnclosingNodeParser,
  NodeParserState,
  StringLiteralNode,
} from "@evmcrispr/sdk";
import { buildParserError, NodeType } from "@evmcrispr/sdk";
import { coroutine, getData, regex, setData, str } from "arcsecond";
import {
  createNodeLocation,
  currentContexDataParser,
  enclosingLookaheadParser,
  locate,
} from "../../utils";

export const HEREDOC_PARSER_ERROR = "HeredocParserError";

/**
 * Heredoc string literal:
 *
 *   <<<SOL
 *   pragma solidity 0.8.26;
 *   contract Counter { ... }
 *   SOL
 *
 * `<<<` + an uppercase sentinel opens the block; a line consisting of the
 * same sentinel (alone) closes it. Content is raw — no escape processing —
 * which makes it the natural carrier for embedded foreign code. The editor
 * grammars give `<<<SOL` blocks embedded Solidity highlighting; any other
 * sentinel is tokenized as a plain string. Desugars to a `StringLiteral`
 * (with a `heredoc` marker), so the value works anywhere a string does.
 */
export const heredocParser: EnclosingNodeParser<StringLiteralNode> = (
  enclosingParsers = [],
) =>
  locate<StringLiteralNode>(
    coroutine((run) => {
      run(str("<<<"));
      const sentinel: string = run(regex(/^[A-Z][A-Z0-9]*/));
      // Rest of the opening line, then everything up to the sentinel at a
      // line start. The word-boundary guard keeps `SOLIDITY` from closing
      // a `<<<SOL` block while still allowing the script to continue on
      // the closing line (`SOL)`, `SOL --create2 …`).
      const body: string = run(
        regex(
          new RegExp(
            `^[ \\t]*\\n(?:[\\s\\S]*?\\n)??${sentinel}(?![A-Za-z0-9_])`,
          ),
        ),
      );
      // body = "<opening-line tail>\n<content>\n<sentinel>"
      const inner = body.slice(body.indexOf("\n") + 1);
      const value = inner
        .slice(0, inner.length - sentinel.length)
        .replace(/\n$/, "");

      // Multi-line loc bookkeeping (same contract as stringParser):
      // advance `state.line` and reset `state.offset` so subsequent locs
      // stay correct. `currentContexDataParser` yields the absolute index
      // right after the closing sentinel.
      const consumed = `<<<${sentinel}${body}`;
      const newlineCount = (consumed.match(/\n/g) || []).length;
      if (newlineCount > 0) {
        const ctx = run(currentContexDataParser);
        const matchStart = ctx!.index - consumed.length;
        const newOffset = matchStart + consumed.lastIndexOf("\n") + 1;
        run(
          getData.chain<any>((state: NodeParserState) =>
            setData<any, string, NodeParserState>({
              ...state,
              line: state.line + newlineCount,
              offset: newOffset,
            }),
          ),
        );
      }

      run(enclosingLookaheadParser(enclosingParsers));
      return [value, sentinel];
    }).errorMap((err) =>
      buildParserError(
        err,
        HEREDOC_PARSER_ERROR,
        "Expected a terminated heredoc — close <<<TAG with a line containing only TAG",
      ),
    ),
    ({ data, index, result: [initialContext, [value, sentinel]] }) => {
      return {
        type: NodeType.StringLiteral,
        value: value as StringLiteralNode["value"],
        heredoc: sentinel as string,
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      };
    },
  );

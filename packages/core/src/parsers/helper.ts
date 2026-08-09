import type {
  ArgumentExpressionNode,
  HelperFunctionNode,
  NodeParser,
} from "@evmcrispr/sdk";
import { buildParserError, NodeType } from "@evmcrispr/sdk";
import {
  char,
  coroutine,
  lookAhead,
  possibly,
  recursiveParser,
  regex,
  takeLeft,
} from "arcsecond";
import { argumentsParser } from "./expression";
import {
  bangCallOperatorParser,
  callOperatorParser,
  createNodeLocation,
  enclosingLookaheadParser,
  locate,
  openingCharParser,
} from "./utils";

export const HELPER_PARSER_ERROR = "HelperParserError";

/** Optional `module:` namespace followed by the helper's local name.
 *  Module charset mirrors COMMAND_NAME_REGEX; `.` in the name is
 *  intra-module hierarchy (e.g. @ens:fuses.decode). A single trailing `!`
 *  is part of the name — modules use it to mark on-chain-evaluated
 *  helpers (e.g. @balance! in the assertions module). */
const HELPER_NAME_REGEX =
  /^(?:(?<module>[a-zA-Z-]{1,63}(?<!-)):)?(?<name>(?!-|\.)[a-zA-Z0-9_\-.]+(?<!-|\.)!?)/;

const helperNameParser = takeLeft(regex(HELPER_NAME_REGEX))(
  enclosingLookaheadParser([
    char("("),
    char("]"),
    char("}"),
    bangCallOperatorParser,
    callOperatorParser,
    char(")"),
    char(">"),
  ]),
)
  .errorMap((err) =>
    buildParserError(
      err,
      HELPER_PARSER_ERROR,
      'Expected a helper name after "@" (e.g. @token(DAI), @me or @ens:addr(vitalik.eth))',
    ),
  )
  .map((value: string | undefined) => {
    const res = HELPER_NAME_REGEX.exec(value ?? "");
    const { module, name } = res?.groups || {};
    return { module, name };
  });

/** Rename target of an import-list entry: `@name>@newName`. A single
 *  trailing `!` is allowed so on-chain (`!`) helper faces can be imported
 *  and renamed (e.g. `@min!>@smallest!`). */
const renameNameParser = takeLeft(
  regex(/^(?!-|\.)[a-zA-Z0-9_\-.]+(?<!-|\.)!?/),
)(enclosingLookaheadParser([char("]"), char("}"), char(")")])).errorMap((err) =>
  buildParserError(
    err,
    HELPER_PARSER_ERROR,
    'Expected "@" and a new name after ">" (e.g. @addr>@myAddr)',
  ),
);

export const helperFunctionParser: NodeParser<HelperFunctionNode> =
  recursiveParser(() =>
    locate<HelperFunctionNode>(
      coroutine((run) => {
        run(char("@"));

        const { module, name } = run(helperNameParser) as {
          module?: string;
          name: string;
        };

        let rename: string | undefined;
        if (run(possibly(lookAhead(char(">"))))) {
          run(char(">"));
          run(
            char("@").errorMap((err) =>
              buildParserError(
                err,
                HELPER_PARSER_ERROR,
                'Expected "@" and a new name after ">" (e.g. @addr>@myAddr)',
              ),
            ),
          );
          rename = run(renameNameParser);
        }

        let args: ArgumentExpressionNode[] = [];

        if (run(possibly(lookAhead(openingCharParser("("))))) {
          args = run(
            argumentsParser.errorMap((err) =>
              buildParserError(err, HELPER_PARSER_ERROR),
            ),
          );
        }

        return [module, name, rename, args];
      }),
      ({
        data,
        index,
        result: [initialContext, [module, name, rename, args]],
      }) => ({
        type: NodeType.HelperFunctionExpression,
        ...(module ? { module: module as string } : {}),
        name: name as HelperFunctionNode["name"],
        ...(rename ? { rename: rename as string } : {}),
        args: args as HelperFunctionNode["args"],
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      }),
    ),
  );

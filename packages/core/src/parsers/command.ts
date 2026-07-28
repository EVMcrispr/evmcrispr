import type {
  CommandArgExpressionNode,
  CommandExpressionNode,
  CommandOptNode,
  ErrorCaptureNode,
  EventCaptureNode,
  Node,
  NodeParser,
  TxCaptureNode,
} from "@evmcrispr/sdk";
import { buildParserError, NodeType } from "@evmcrispr/sdk";
import {
  choice,
  coroutine,
  either,
  endOfInput,
  everyCharUntil,
  lookAhead,
  possibly,
  recursiveParser,
  regex,
  sequenceOf,
  str,
} from "arcsecond";
import {
  errorCaptureParser,
  eventCaptureParser,
  txCaptureParser,
} from "./capture";
import { commentParser } from "./comment";

import { argumentExpressionParser, expressionParser } from "./expression";
import {
  addNewError,
  camelAndKebabCase,
  createNodeLocation,
  enclose,
  endLine,
  endOfLine,
  locate,
  optionalWhitespace,
  optOperatorParser,
  whitespace,
} from "./utils";

type CommandName = {
  module?: string;
  name: string;
};

const COMMAND_NAME_REGEX =
  /^(?:(?<module>[a-zA-Z-]{1,63}(?<!-))(?::))?(?<command>[a-zA-Z-]{1,63}(?<!-))/;

const commandNameParser = enclose(regex(COMMAND_NAME_REGEX))
  .errorMap((err) =>
    buildParserError(
      err,
      COMMAND_PARSER_ERROR,
      'Expected a command name like "set" or "aragonos:connect" (letters and dashes only)',
    ),
  )
  .map((value): CommandName => {
    const res = COMMAND_NAME_REGEX.exec(value);
    const { module, command } = res?.groups || {};

    const commandName: CommandName = { name: command };

    if (module) commandName.module = module;

    return commandName;
  });

export const commandOptParser: NodeParser<CommandOptNode> = recursiveParser(
  () =>
    locate<CommandOptNode>(
      sequenceOf([
        optOperatorParser,
        enclose(camelAndKebabCase).errorMap((err) =>
          buildParserError(
            err,
            COMMAND_PARSER_ERROR,
            'Expected an option name after "--" (e.g. --gas-limit 2e6)',
          ),
        ),
        whitespace,
        argumentExpressionParser(),
      ]),
      ({ data, index, result: [initialContext, [, name, , value]] }) => ({
        type: NodeType.CommandOpt,
        name: name as CommandOptNode["name"],
        value: value as CommandOptNode["value"],
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      }),
    ),
);

const captureArrowLookahead = lookAhead(
  sequenceOf([whitespace, str("->"), whitespace]),
);

const errorCaptureArrowLookahead = lookAhead(
  sequenceOf([whitespace, choice([str("-?!>"), str("-!>")]), whitespace]),
);

const txCaptureArrowLookahead = lookAhead(
  sequenceOf([whitespace, choice([str("$*>"), str("$>")]), whitespace]),
);

const isLastParameter = possibly(
  lookAhead(sequenceOf([optionalWhitespace, choice([endOfLine, endOfInput])])),
);

const commandArgsParser = coroutine((run) => {
  let commandArgOrOpt: CommandArgExpressionNode;

  if (run(possibly(lookAhead(optOperatorParser)))) {
    commandArgOrOpt = run(commandOptParser);
  } else {
    commandArgOrOpt = run(expressionParser());
  }

  return commandArgOrOpt;
});

export const COMMAND_PARSER_ERROR = "CommandParserError";

export const endOfCommandParser = choice([endLine, lookAhead(endOfInput)]);

export const commandExpressionParser: NodeParser<CommandExpressionNode> =
  recursiveParser(() =>
    sequenceOf([
      optionalWhitespace,
      locate<CommandExpressionNode>(
        coroutine((run) => {
          const commandName: CommandName = run(commandNameParser);

          const { name, module } = commandName;

          const commandArgsAndOpts: (
            | CommandArgExpressionNode
            | CommandOptNode
          )[] = [];

          if (
            run(
              possibly(
                lookAhead(
                  sequenceOf([
                    optionalWhitespace,
                    choice([endOfLine, endOfInput]),
                  ]),
                ),
              ),
            )
          ) {
            return [module, name, [], [], [], [], []];
          }

          do {
            /**
             * Check if there's a comment ahead but don't consume it
             * to avoid having an incorrect loc property
             */
            if (run(possibly(lookAhead(commentParser)))) {
              break;
            }

            /**
             * Check if there's a capture arrow (->, -!>, -?!>, $>, $*>)
             * ahead. If so, stop parsing args and move to capture parsing.
             */
            if (run(possibly(captureArrowLookahead))) {
              break;
            }
            if (run(possibly(errorCaptureArrowLookahead))) {
              break;
            }
            if (run(possibly(txCaptureArrowLookahead))) {
              break;
            }

            run(whitespace);

            const res: {
              isError: boolean;
              value: any;
            } = run(either(commandArgsParser));

            if (res.isError) {
              run(addNewError(res.value));
              run(everyCharUntil(choice([whitespace, endOfLine])));
            } else {
              commandArgsAndOpts.push(res.value);
            }
          } while (!run(isLastParameter));

          // Parse capture clauses in any textual order:
          //   -> EventName ...   (event captures)
          //   -!> / -?!> ...     (error captures)
          //   $> $var / $*> $var (tx-hash captures)
          const eventCaptures: EventCaptureNode[] = [];
          const errorCaptures: ErrorCaptureNode[] = [];
          const txCaptures: TxCaptureNode[] = [];
          for (;;) {
            if (run(possibly(lookAhead(sequenceOf([whitespace, str("->")]))))) {
              run(whitespace);
              eventCaptures.push(run(eventCaptureParser));
              continue;
            }
            if (
              run(
                possibly(
                  lookAhead(
                    sequenceOf([whitespace, choice([str("-?!>"), str("-!>")])]),
                  ),
                ),
              )
            ) {
              run(whitespace);
              errorCaptures.push(run(errorCaptureParser));
              continue;
            }
            if (
              run(
                possibly(
                  lookAhead(
                    sequenceOf([
                      whitespace,
                      choice([str("$*>"), str("$>")]),
                      whitespace,
                    ]),
                  ),
                ),
              )
            ) {
              run(whitespace);
              txCaptures.push(run(txCaptureParser));
              continue;
            }
            break;
          }

          const args = commandArgsAndOpts.filter(
            (cArg) => cArg.type !== NodeType.CommandOpt,
          );

          const opts = commandArgsAndOpts.filter(
            (cArg) => cArg.type === NodeType.CommandOpt,
          ) as CommandOptNode[];

          return [
            module,
            name,
            args,
            opts,
            eventCaptures,
            errorCaptures,
            txCaptures,
          ];
        }),
        ({
          data,
          index,
          result: [
            initialContext,
            [
              module,
              name,
              args,
              opts,
              eventCaptures,
              errorCaptures,
              txCaptures,
            ],
          ],
        }) => {
          const node: CommandExpressionNode = {
            type: NodeType.CommandExpression,
            ...(module ? { module } : {}),
            name: name as string,
            args: args as Node[],
            opts: opts as CommandOptNode[],
            loc: createNodeLocation(initialContext, {
              line: data.line,
              index,
              offset: data.offset,
            }),
          };
          const evtCaptures = eventCaptures as EventCaptureNode[];
          if (evtCaptures && evtCaptures.length > 0) {
            node.eventCaptures = evtCaptures;
          }
          const errCaptures = errorCaptures as ErrorCaptureNode[];
          if (errCaptures && errCaptures.length > 0) {
            node.errorCaptures = errCaptures;
          }
          const hashCaptures = txCaptures as TxCaptureNode[];
          if (hashCaptures && hashCaptures.length > 0) {
            node.txCaptures = hashCaptures;
          }
          return node;
        },
      ),
      choice([
        commentParser,
        sequenceOf([optionalWhitespace, endOfCommandParser]),
      ]),
    ]).map(([, commandNode]) => {
      return commandNode;
    }),
  );

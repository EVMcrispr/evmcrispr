import {
  char,
  choice,
  coroutine,
  endOfInput,
  lookAhead,
  possibly,
  recursiveParser,
  regex,
  sequenceOf,
} from 'arcsecond';

import type {
  CommandArgExpressionNode,
  CommandExpressionNode,
  CommandOptNode,
  Node,
  NodeParser,
} from '../types';
import { NodeType } from '../types';
import { buildParserError } from '../utils/parsers';
import { commentParser } from './comment';

import { argumentExpressionParser, expressionParser } from './expression';
import {
  camelAndKebabCase,
  createNodeLocation,
  enclose,
  endOfLine,
  locate,
  optOperatorParser,
  optionalWhitespace,
  whitespace,
} from './utils';

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
      'Expecting a valid command name',
    ),
  )
  .map((value): CommandName => {
    const res = COMMAND_NAME_REGEX.exec(value);
    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
    const { module, command } = res?.groups!;

    const commandName: CommandName = { name: command };

    if (module) commandName.module = module;

    return commandName;
  });

const commandOptParser: NodeParser<CommandOptNode> = locate<CommandOptNode>(
  sequenceOf([
    optOperatorParser,
    enclose(camelAndKebabCase).errorMap((err) =>
      buildParserError(
        err,
        COMMAND_PARSER_ERROR,
        'Expecting a valid option name',
      ),
    ),
    whitespace,
    argumentExpressionParser,
  ]),
  ({ data, index, result: [initialContext, [, name, , value]] }) => ({
    type: NodeType.CommandOpt,
    name: name as CommandOptNode['name'],
    value: value as CommandOptNode['value'],
    loc: createNodeLocation(initialContext, {
      line: data.line,
      index,
      offset: data.offset,
    }),
  }),
);

const isLastParameter = possibly(
  lookAhead(sequenceOf([optionalWhitespace, choice([char('\n'), endOfInput])])),
);

const commandArgsParser = coroutine(function* () {
  let commandArgOrOpt: CommandArgExpressionNode;

  if (yield possibly(lookAhead(optOperatorParser))) {
    commandArgOrOpt =
      (yield commandOptParser) as unknown as CommandArgExpressionNode;
  } else {
    commandArgOrOpt =
      (yield expressionParser) as unknown as CommandArgExpressionNode;
  }

  return commandArgOrOpt;
});

export const COMMAND_PARSER_ERROR = 'CommandParserError';

export const endOfCommandParser = choice([endOfLine, endOfInput]);

export const commandExpressionParser: NodeParser<CommandExpressionNode> =
  recursiveParser(() =>
    sequenceOf([
      optionalWhitespace,
      locate<CommandExpressionNode>(
        coroutine(function* () {
          const commandName =
            (yield commandNameParser) as unknown as CommandName;

          const commandArgsAndOpts: (
            | CommandArgExpressionNode
            | CommandOptNode
          )[] = [];

          do {
            if (yield possibly(lookAhead(commentParser))) {
              break;
            }

            yield whitespace;

            const arg = (yield commandArgsParser) as unknown as
              | CommandArgExpressionNode
              | CommandOptNode;

            commandArgsAndOpts.push(arg);
          } while (!(yield isLastParameter));

          const args = commandArgsAndOpts.filter(
            (cArg) => cArg.type !== NodeType.CommandOpt,
          );

          const opts = commandArgsAndOpts.filter(
            (cArg) => cArg.type === NodeType.CommandOpt,
          ) as CommandOptNode[];

          const { name, module } = commandName;

          return [module, name, args, opts];
        }),
        ({
          data,
          index,
          result: [initialContext, [module, name, args, opts]],
        }) => ({
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
        }),
      ),
      choice([
        commentParser,
        sequenceOf([optionalWhitespace, endOfCommandParser]),
      ]),
    ]).map(([, commandNode]) => {
      return commandNode;
    }),
  );

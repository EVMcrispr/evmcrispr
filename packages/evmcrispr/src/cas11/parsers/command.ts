import {
  choice,
  coroutine,
  endOfInput,
  many1,
  recursiveParser,
  regex,
  sequenceOf,
  str,
} from 'arcsecond';

import type {
  CommandArgExpressionNode,
  CommandExpressionNode,
  CommandOptNode,
  NodeParser,
} from '../types';
import { NodeType } from '../types';

import { argumentExpressionParser, expressionParser } from './expression';
import {
  camelAndKebabCase,
  endOfLine,
  optionalWhitespace,
  whitespace,
} from './utils';

type CommandName = {
  module?: string;
  name: string;
};
const commandNameRegex =
  /^(?:(?<module>[a-zA-Z-]{1,63}(?<!-))(?::))?(?<command>[a-zA-Z-]{1,63}(?<!-))/;

const commandNameParser = regex(commandNameRegex).map((value): CommandName => {
  const res = commandNameRegex.exec(value);
  // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
  const { module, command } = res?.groups!;

  const commandName: CommandName = { name: command };

  if (module) commandName.module = module;

  return commandName;
});

const optOperatorParser = str('--');

const commandOptParser: NodeParser<CommandOptNode> = sequenceOf([
  optOperatorParser,
  camelAndKebabCase,
  whitespace,
  argumentExpressionParser,
]).map(([, name, , value]) => ({
  type: NodeType.CommandOpt,
  name,
  value,
}));

const commandArgsParser = many1<CommandArgExpressionNode | CommandOptNode>(
  coroutine(function* () {
    yield whitespace;

    const commandArgOrOpt = (yield choice([
      commandOptParser,
      expressionParser,
    ])) as unknown as CommandArgExpressionNode | CommandOptNode;

    return commandArgOrOpt;
  }),
);

export const endOfCommandParser = choice([endOfLine, endOfInput]);

export const commandExpressionParser: NodeParser<CommandExpressionNode> =
  recursiveParser(() =>
    coroutine(function* () {
      yield optionalWhitespace;

      const commandName = (yield commandNameParser) as unknown as CommandName;

      const commandArgsAndOpts = (yield commandArgsParser) as unknown as (
        | CommandArgExpressionNode
        | CommandOptNode
      )[];

      const args = commandArgsAndOpts.filter(
        (cArg) => cArg.type !== NodeType.CommandOpt,
      );

      const opts = commandArgsAndOpts.filter(
        (cArg) => cArg.type === NodeType.CommandOpt,
      ) as CommandOptNode[];

      yield optionalWhitespace;

      yield endOfCommandParser;

      const c: CommandExpressionNode = {
        type: NodeType.CommandExpression,
        ...commandName,
        args,
        opts,
      };

      return c;
    }),
  );

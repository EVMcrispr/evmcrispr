import type { Parser } from 'arcsecond';
import {
  choice,
  coroutine,
  endOfInput,
  many1,
  recursiveParser,
  regex,
} from 'arcsecond';

import type { CommandExpressionNode, CommandIdentifierNode } from '../types';
import { NodeType } from '../types';

import { expressionParser } from './expression';
import { endOfLine, optionalWhitespace, whitespace } from './utils';

const commandNameRegex =
  /^(?:(?<module>[a-zA-Z-]{1,63}(?<!-))(?::))?(?<command>[a-zA-Z-]{1,63}(?<!-))/;
const commandNameParser = regex(commandNameRegex).map(
  (value): CommandIdentifierNode => {
    const res = commandNameRegex.exec(value);
    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
    const { module, command } = res?.groups!;

    const c: CommandIdentifierNode = {
      type: NodeType.CommandIdentifier,
      value: command,
    };

    c.value = command;
    if (module) c.module = module;

    return c;
  },
);

const commandArgsParser = many1(
  coroutine(function* () {
    yield whitespace;

    const args = yield expressionParser;

    return args;
  }),
);

export const endOfCommandParser = choice([endOfLine, endOfInput]);

export const commandExpressionParser: Parser<
  CommandExpressionNode,
  string,
  any
> = recursiveParser(() =>
  coroutine(function* () {
    yield optionalWhitespace;

    const name = yield commandNameParser;

    const args = yield commandArgsParser;

    yield optionalWhitespace;

    yield endOfCommandParser;

    return {
      type: NodeType.CommandExpression,
      name,
      args,
    } as unknown as CommandExpressionNode;
  }),
);

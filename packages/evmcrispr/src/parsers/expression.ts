import {
  between,
  char,
  choice,
  recursiveParser,
  sequenceOf,
  str,
} from 'arcsecond';

import type {
  ArgumentExpressionNode,
  AsExpressionNode,
  CommandArgExpressionNode,
  EnclosingNodeParser,
  NodeParser,
} from '../types';
import { NodeType } from '../types';
import { getIncorrectReceivedValue } from '../utils/parsers';
import { arithmeticParser } from './arithmetic';
import { arrayExpressionParser } from './array';
import { blockExpressionParser } from './block';

import { callExpressionParser } from './call';
import { helperFunctionParser } from './helper';
import {
  primaryParser,
  probableIdentifierParser,
  stringParser,
  variableIdentifierParser,
} from './primaries';
import {
  closingCharParser,
  comma,
  commaSeparated,
  createNodeLocation,
  locate,
  openingCharParser,
  whitespace,
} from './utils';

const asExpressionParser: NodeParser<AsExpressionNode> =
  locate<AsExpressionNode>(
    sequenceOf([
      choice([stringParser(), probableIdentifierParser()]),
      whitespace,
      str('as'),
      whitespace,
      choice([stringParser(), probableIdentifierParser()]),
    ]),
    ({ data, index, result: [initialContext, [left, , , , right]] }) => ({
      type: NodeType.AsExpression,
      left: left as AsExpressionNode['left'],
      right: right as AsExpressionNode['right'],
      loc: createNodeLocation(initialContext, {
        line: data.line,
        index,
        offset: data.offset,
      }),
    }),
  );
export const argumentExpressionParser: EnclosingNodeParser<
  ArgumentExpressionNode
> = (enclosingParsers = []) =>
  recursiveParser(() =>
    choice([
      arithmeticParser,
      callExpressionParser,
      helperFunctionParser,
      arrayExpressionParser,
      primaryParser(enclosingParsers),
      variableIdentifierParser(enclosingParsers),
      probableIdentifierParser(enclosingParsers),
    ]).errorMap(({ data, error, index }) => {
      return `ExpressionParserError(${data.line},${
        index - data.offset
      }): Expecting a valid expression${getIncorrectReceivedValue(error)}`;
    }),
  );

export const expressionParser: EnclosingNodeParser<
  CommandArgExpressionNode | string | null
> = (enclosingParsers = []) =>
  recursiveParser(() =>
    choice([
      arithmeticParser,
      asExpressionParser,
      callExpressionParser,
      helperFunctionParser,
      blockExpressionParser,
      arrayExpressionParser,
      primaryParser(enclosingParsers),
      variableIdentifierParser(enclosingParsers),
      probableIdentifierParser(enclosingParsers),
    ]).errorMap(({ data, error, index }) => {
      return `ExpressionParserError(${data.line},${
        index - data.offset
      }): Expecting a valid expression${getIncorrectReceivedValue(error)}`;
    }),
  );

export const argumentsParser: NodeParser<ArgumentExpressionNode[]> =
  recursiveParser(() =>
    between<
      [string, string | null],
      ArgumentExpressionNode[],
      [string | null, string]
    >(openingCharParser('('))(closingCharParser(')'))(
      commaSeparated<ArgumentExpressionNode>(
        argumentExpressionParser([comma, char(')')]),
      ),
    ),
  );

import {
  choice,
  lookAhead,
  recursiveParser,
  regex,
  sequenceOf,
} from 'arcsecond';

import type {
  NodeParser,
  ProbableIdentifierNode,
  VariableIdentiferNode,
} from '../../types';
import { NodeType } from '../../types';
import { buildParserError } from '../../utils/parsers';
import {
  baseEnclosingCharParsers,
  callOperatorParser,
  createNodeLocation,
  locate,
} from '../utils';

export const VARIABLE_PARSER_ERROR = 'VariableParserError';

export const PROBABLE_IDENTIFIER_PARSER_ERROR = 'IdentifierParserError';

export const variableIdentifierParser: NodeParser<VariableIdentiferNode> =
  recursiveParser(() =>
    locate<VariableIdentiferNode>(
      sequenceOf([
        regex(/^\$(?:(?!::|--|\(|\)|\[|\]|,|\s).)+/),
        lookAhead(choice([...baseEnclosingCharParsers, callOperatorParser])),
      ]).errorMap((err) =>
        buildParserError(err, VARIABLE_PARSER_ERROR, 'Expecting a variable'),
      ),
      ({ data, index, result: [initialContext, [value]] }) => ({
        type: NodeType.VariableIdentifier,
        value: value as VariableIdentiferNode['value'],
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      }),
    ),
  );

export const probableIdentifierParser: NodeParser<ProbableIdentifierNode> =
  recursiveParser(() =>
    locate<ProbableIdentifierNode>(
      sequenceOf([
        regex(/^(?:(?!::|--|\(|\)|\[|\]|,|\s).)+/),
        lookAhead(choice([...baseEnclosingCharParsers, callOperatorParser])),
      ]).errorMap((err) =>
        buildParserError(
          err,
          PROBABLE_IDENTIFIER_PARSER_ERROR,
          'Expecting an identifier',
        ),
      ),
      ({ data, index, result: [initialContext, [value]] }) => ({
        type: NodeType.ProbableIdentifier,
        value: value as ProbableIdentifierNode['value'],
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      }),
    ),
  );

// const FULL_IDENTIFIER_REGEX = /^(?:(?!::|\(|\)).)+/;

export const fullProbableIdentifierParser: NodeParser<ProbableIdentifierNode> =
  recursiveParser(() =>
    locate<ProbableIdentifierNode>(
      sequenceOf([
        regex(/^(?:(?!::|\(|\)).)+/),
        lookAhead(choice([...baseEnclosingCharParsers, callOperatorParser])),
      ]).errorMap((err) =>
        buildParserError(
          err,
          PROBABLE_IDENTIFIER_PARSER_ERROR,
          'Expecting an identifier',
        ),
      ),
      ({ data, index, result: [initialContext, [value]] }) => ({
        type: NodeType.ProbableIdentifier,
        value: value as ProbableIdentifierNode['value'],
        loc: createNodeLocation(initialContext, {
          line: data.line,
          index,
          offset: data.offset,
        }),
      }),
    ),
  );
// calc((1 + 1e18) / 25 * ((25 - 1) / 2) * 2 * (2))

// get(adress, transfer(123, 1e18))

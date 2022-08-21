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
import { callOperatorParser, commonEnclosingCharParsers } from '../utils';

export const VARIABLE_PARSER_ERROR = 'VariableParserError';

export const PROBABLE_IDENTIFIER_PARSER_ERROR = 'ProbableIdentifierParserError';

export const variableIdentifierParser: NodeParser<VariableIdentiferNode> =
  recursiveParser(() =>
    sequenceOf([
      regex(/^\$(?:(?!::|--|\(|\)|\[|\]|,|\s).)+/),
      lookAhead(choice([...commonEnclosingCharParsers, callOperatorParser])),
    ])
      .errorMap((err) =>
        buildParserError(err, VARIABLE_PARSER_ERROR, 'Expecting a variable'),
      )
      .map(([value]) => ({
        type: NodeType.VariableIdentifier,
        value,
      })),
  );

export const probableIdentifierParser: NodeParser<ProbableIdentifierNode> =
  recursiveParser(() =>
    sequenceOf([
      regex(/^(?:(?!::|--|\(|\)|\[|\]|,|\s).)+/),
      lookAhead(choice([...commonEnclosingCharParsers, callOperatorParser])),
    ])
      .errorMap((err) =>
        buildParserError(
          err,
          PROBABLE_IDENTIFIER_PARSER_ERROR,
          'Expecting an identifier',
        ),
      )
      .map(([value]) => ({
        type: NodeType.ProbableIdentifier,
        value: value as string,
      })),
  );

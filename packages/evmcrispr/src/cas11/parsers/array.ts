import { between, char, recursiveParser, sequenceOf } from 'arcsecond';

import type { ArrayExpressionNode, NodeParser } from '../types';
import { NodeType } from '../types';

import { argumentExpressionParser } from './expression';

import { commaSeparated, optionalWhitespace } from './utils';

export const arrayExpressionParser: NodeParser<ArrayExpressionNode> =
  recursiveParser(() =>
    between(sequenceOf([char('['), optionalWhitespace]))(
      sequenceOf([optionalWhitespace, char(']')]),
    )(commaSeparated(argumentExpressionParser)).map((elements: any) => {
      return {
        type: NodeType.ArrayExpression,
        elements,
      };
    }),
  );

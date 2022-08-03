import {
  choice,
  lookAhead,
  recursiveParser,
  regex,
  sequenceOf,
} from 'arcsecond';

import type {
  ProbableIdentifierNode,
  VariableIdentiferNode,
} from '../../types';
import { NodeType } from '../../types';
import { callOperatorParser, commonEnclosingCharParsers } from '../utils';

export const variableIdentifierParser = recursiveParser(() =>
  sequenceOf([
    regex(/^\$(?:(?!::|\(|\)|\[|\]|,|\s).)+/),
    lookAhead(choice([...commonEnclosingCharParsers, callOperatorParser])),
  ]).map(
    ([value]): VariableIdentiferNode => ({
      type: NodeType.VariableIdentifier,
      value,
    }),
  ),
);

export const probableIdentifierParser = recursiveParser(() =>
  sequenceOf([
    regex(/^(?:(?!::|\(|\)|\[|\]|,|\s).)+/),
    lookAhead(choice([...commonEnclosingCharParsers, callOperatorParser])),
  ]).map(
    ([value]): ProbableIdentifierNode => ({
      type: NodeType.ProbableIdentifier,
      value: value as string,
    }),
  ),
);

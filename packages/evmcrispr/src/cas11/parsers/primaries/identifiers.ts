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
import { callSymbolParser, commonEnclosingCharParsers } from '../utils';

export const variableIdentifierParser = recursiveParser(() =>
  sequenceOf([
    regex(/^\$[a-zA-Z\d#\-.]+/),
    lookAhead(choice([...commonEnclosingCharParsers, callSymbolParser])),
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
    lookAhead(choice([...commonEnclosingCharParsers, callSymbolParser])),
  ]).map(
    ([value]): ProbableIdentifierNode => ({
      type: NodeType.ProbableIdentifier,
      value: value as string,
    }),
  ),
);

import { recursiveParser, regex } from 'arcsecond';

import type {
  ProbableIdentifierNode,
  VariableIdentiferNode,
} from '../../types';
import { NodeType } from '../../types';

export const variableIdentifierParser = recursiveParser(() =>
  regex(/^\$[a-zA-Z\d#-.]+/).map(
    (value): VariableIdentiferNode => ({
      type: NodeType.VariableIdentifier,
      value,
    }),
  ),
);

export const probableIdentifierParser = recursiveParser(() =>
  regex(/^[a-zA-Z\d#\-.]+/).map(
    (value): ProbableIdentifierNode => ({
      type: NodeType.ProbableIdentifier,
      value: value as string,
    }),
  ),
);

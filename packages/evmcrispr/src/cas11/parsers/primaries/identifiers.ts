import { recursiveParser, regex } from 'arcsecond';

import type { IdentifierNode, VariableIdentiferNode } from '../../types';
import { NodeType } from '../../types';

export const variableIdentifierParser = recursiveParser(() =>
  regex(/^(\$(?!-)[a-zA-Z0-9-]{1,63}(?<!-))/).map(
    (value): VariableIdentiferNode => ({
      type: NodeType.VariableIdentifier,
      value,
    }),
  ),
);

export const identifierParser = recursiveParser(() =>
  regex(/^((?!-)[a-zA-Z0-9-]{1,63}(?<!-))(?:\.([a-z0-9-]{1,63}))*(?<!-)/).map(
    (value): IdentifierNode => ({
      type: NodeType.Identifier,
      value,
    }),
  ),
);

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
import { callOperatorParser, commonEnclosingCharParsers } from '../utils';

export const variableIdentifierParser: NodeParser<VariableIdentiferNode> =
  recursiveParser(() =>
    sequenceOf([
      regex(/^\$(?:(?!::|--|\(|\)|\[|\]|,|\s).)+/),
      lookAhead(choice([...commonEnclosingCharParsers, callOperatorParser])),
    ]).map(([value]) => ({
      type: NodeType.VariableIdentifier,
      value,
    })),
  );

export const probableIdentifierParser: NodeParser<ProbableIdentifierNode> =
  recursiveParser(() =>
    sequenceOf([
      regex(/^(?:(?!::|--|\(|\)|\[|\]|,|\s).)+/),
      lookAhead(choice([...commonEnclosingCharParsers, callOperatorParser])),
    ]).map(([value]) => ({
      type: NodeType.ProbableIdentifier,
      value: value as string,
    })),
  );

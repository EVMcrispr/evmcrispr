import type { Parser } from 'arcsecond';

import type { Node } from './ast';

export type LocationData = { line: number; index: number; offset: number };

export type NodeParserState = {
  line: number;
  offset: number;
  errors: string[];
};

export type NodeParser<T = Node> = Parser<T, string, NodeParserState>;

export type EnclosingNodeParser<T = Node> = (
  enclosingParsers?: Parser<string, string, any>[],
) => NodeParser<T>;

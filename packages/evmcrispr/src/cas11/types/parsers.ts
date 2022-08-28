import type { Parser } from 'arcsecond';

import type { Node } from './ast';

export type LocationData = { line: number; index: number; offset: number };

export type NodeParserState = {
  line: number;
  offset: number;
};

export type NodeParser<T = Node> = Parser<T, string, NodeParserState>;

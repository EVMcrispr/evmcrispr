import type { Parser } from 'arcsecond';

import type { NodeParserState } from '../parsers/utils';

import type { Node } from './ast';

export type NodeParser<T = Node> = Parser<T, string, NodeParserState>;

import type { Parser } from 'arcsecond';

import type { Node } from './ast';

export type NodeParser<T = Node> = Parser<T, string, any>;

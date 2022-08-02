import type { Parser } from 'arcsecond';

import type { Node } from './ast';

export type NodeParser = Parser<Node, string, any>;

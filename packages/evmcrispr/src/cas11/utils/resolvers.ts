import type { LazyNode } from '../interpreter/Interpreter';

export const resolveLazyNodes = async (lazyNodes: LazyNode[]): Promise<any[]> =>
  (await Promise.all(lazyNodes.map((lazyNode) => lazyNode.execute()))).flat();

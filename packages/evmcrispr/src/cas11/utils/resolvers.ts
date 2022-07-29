import type { LazyNode } from '../interpreter/Interpreter';

export const resolveLazyNodes = async (
  lazyNodes: LazyNode[],
  sequentally = false,
): Promise<any[]> => {
  if (sequentally) {
    const results: any = [];

    for (const lazyNode of lazyNodes) {
      const result = await lazyNode.resolve();
      if (Array.isArray(result)) {
        results.push(...result);
      } else {
        results.push(result);
      }
    }

    return results;
  }

  return await Promise.all(lazyNodes.map((lazyNode) => lazyNode.resolve()));
};

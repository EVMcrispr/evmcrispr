import type { NodeResolver } from '../interpreter/Interpreter';

export const runNodeResolvers = async (
  nodeResolvers: NodeResolver[],
  args: any[] = [],
): Promise<any[]> =>
  (
    await Promise.all(
      nodeResolvers.map((nodeResolver) => nodeResolver(...args)),
    )
  ).flat();

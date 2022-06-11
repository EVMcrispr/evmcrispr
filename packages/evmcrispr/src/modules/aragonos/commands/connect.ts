import type { ActionFunction } from '../../..';
import type { ConnectedAragonOS } from '../AragonOS';
import type AragonOS from '../AragonOS';

export function connect(
  module: AragonOS,
  dao: string,
  actions: (dao: ConnectedAragonOS) => ActionFunction[],
  path: string[],
  opts?: { context: string },
): ActionFunction {
  return async () => {
    const _dao = await module.dao(dao);
    const _path = path.map(
      (entity) => module.evm.resolver.resolveEntity(entity) as string,
    );
    return (await module.evm.encode(actions(_dao), _path, opts)).actions;
  };
}

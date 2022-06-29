import type { ActionFunction } from '../../..';
import type { ConnectedAragonOS } from '../AragonOS';
import type AragonOS from '../AragonOS';
import { normalizeActions } from '../../..';
import { batchForwarderActions } from '../utils/forwarders';

export function connect(
  module: AragonOS,
  dao: string,
  actions: (dao: ConnectedAragonOS) => ActionFunction[],
  path: string[],
  opts?: { context: string },
): ActionFunction {
  return async () => {
    const _dao = await module.dao(dao);
    const forwarderActions = await normalizeActions(actions(_dao))();
    const forwarders =
      path
        ?.map((entity) => module.evm.resolver.resolveEntity(entity))
        .reverse() || [];
    return batchForwarderActions(
      module.evm.signer,
      forwarderActions,
      forwarders,
      opts?.context,
    );
  };
}

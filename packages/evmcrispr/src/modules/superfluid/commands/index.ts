import type { Commands } from '../../../types';
import type { Superfluid } from '../Superfluid';
import { approveToken } from './approve-token';

import { batch } from './batch';
import { downgradeToken } from './downgrade-token';
import { setFlow } from './set-flow';
import { transferFrom } from './transfer-from';
import { upgradeToken } from './upgrade-token';

export const commands: Commands<Superfluid> = {
  batch,
  'set-flow': setFlow,
  'upgrade-token': upgradeToken,
  'downgrade-token': downgradeToken,
  'approve-token': approveToken,
  'transfer-from': transferFrom,
};

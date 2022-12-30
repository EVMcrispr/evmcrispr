import type { Commands } from '@1hive/evmcrispr';

import type { AragonOS } from '../AragonOS';
import { act } from './act';
import { connect } from './connect';
import { forward } from './forward';
import { grant } from './grant';
import { install } from './install';
import { newDAO } from './new-dao';
import { newToken } from './new-token';
import { revoke } from './revoke';
import { upgrade } from './upgrade';

export const commands: Commands<AragonOS> = {
  act,
  connect,
  forward,
  grant,
  install,
  'new-dao': newDAO,
  'new-token': newToken,
  revoke,
  upgrade,
};

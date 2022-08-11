import type { CommandFunctions } from '../../../types';
import type { AragonOS } from '../AragonOS';
import { act } from './act';
import { connect } from './connect';
import { grant } from './grant';
import { forward } from './forward';
import { newDAO } from './new-dao';
import { newToken } from './new-token';
import { revoke } from './revoke';
import { upgrade } from './upgrade';

export const commands: CommandFunctions<AragonOS> = {
  act,
  connect,
  forward,
  grant,
  'new-dao': newDAO,
  'new-token': newToken,
  revoke,
  upgrade,
};

import type { CommandFunctions } from '../../../types';
import type { AragonOS } from '../AragonOS';
import { act } from './act';
import { connect } from './connect';
import { grant } from './grant';
import { forward } from './forward';
import { revoke } from './revoke';
import { upgrade } from './upgrade';

export const commands: CommandFunctions<AragonOS> = {
  act,
  connect,
  forward,
  grant,
  revoke,
  upgrade,
};

import type { CommandFunctions } from '../../../types';
import type { AragonOS } from '../AragonOS';
import { act } from './act';
import { connect } from './connect';
import { grant } from './grant';
import { revoke } from './revoke';

export const commands: CommandFunctions<AragonOS> = {
  act,
  connect,
  grant,
  revoke,
};

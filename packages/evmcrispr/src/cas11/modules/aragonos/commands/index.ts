import type { CommandFunction } from '../../../types';
import type { AragonOS } from '../AragonOS';
import { act } from './act';
import { connect } from './connect';
import { grant } from './grant';
import { forward } from './forward';

export const commands: Record<string, CommandFunction<AragonOS>> = {
  act,
  connect,
  forward,
  grant,
};

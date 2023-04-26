import type { Commands } from '../../../types';
import type { Ens } from '../Ens';

import { renew } from './renew';

export const commands: Commands<Ens> = {
  renew,
};

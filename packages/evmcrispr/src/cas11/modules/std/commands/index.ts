import type { CommandFunction } from '../../../types';
import type { Std } from '../Std';

import { exec } from './exec';
import { load } from './load';
import { set } from './set';

export const commands: Record<string, CommandFunction<Std>> = {
  exec,
  load,
  set,
};

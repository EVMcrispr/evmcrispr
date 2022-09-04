import type { CommandFunction } from '../../../types';
import type { Std } from '../Std';

import { exec } from './exec';
import { load } from './load';
import { set } from './set';
import { _switch } from './switch';

export const commands: Record<string, CommandFunction<Std>> = {
  exec,
  load,
  set,
  switch: _switch,
};

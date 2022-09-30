import type { Commands } from '../../../types';
import type { Std } from '../Std';

import { exec } from './exec';
import { load } from './load';
import { set } from './set';
import { _switch } from './switch';

export const commands: Commands<Std> = {
  exec,
  load,
  set,
  switch: _switch,
};

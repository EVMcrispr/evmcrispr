import type { Commands } from '../../../types';
import type { Std } from '../Std';

import { exec } from './exec';
import { load } from './load';
import { set } from './set';
import { _switch } from './switch';
import { raw } from './raw';
import { print } from './print';
import { _for } from './for';

export const commands: Commands<Std> = {
  exec,
  load,
  set,
  switch: _switch,
  raw,
  print,
  for: _for,
};

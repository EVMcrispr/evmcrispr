import type { Commands } from '../../types';
import type { Std } from '../Std';

import { exec } from './exec';
import { _for } from './for';
import { load } from './load';
import { print } from './print';
import { raw } from './raw';
import { set } from './set';
import { _switch } from './switch';

export const commands: Commands<Std> = {
  exec,
  load,
  set,
  switch: _switch,
  raw,
  print,
  for: _for,
};

import type { Suite } from 'mocha';

import { dateDescribe } from './date';
import { idDescribe } from './id';
import { meDescribe } from './me';
import { tokenDescribe } from './token';

export const helpersDescribe = (): Suite =>
  describe('Helpers', () => {
    dateDescribe();

    idDescribe();

    meDescribe();

    tokenDescribe();
  });

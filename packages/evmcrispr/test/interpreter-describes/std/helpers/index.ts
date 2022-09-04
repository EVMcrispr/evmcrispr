import type { Suite } from 'mocha';

import { dateDescribe } from './date';
import { getDescribe } from './get';
import { idDescribe } from './id';
import { ipfsDescribe } from './ipfs';
import { meDescribe } from './me';
import { tokenDescribe } from './token';

export const helpersDescribe = (): Suite =>
  describe('Helpers', () => {
    dateDescribe();

    getDescribe();

    idDescribe();

    ipfsDescribe();

    meDescribe();

    tokenDescribe();
  });

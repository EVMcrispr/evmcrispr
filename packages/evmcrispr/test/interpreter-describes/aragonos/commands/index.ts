import type { Suite } from 'mocha';

import { actDescribe } from './act';
import { connectDescribe } from './connect';
import { forwardDescribe } from './forward';
import { grantDescribe } from './grant';
import { installDescribe } from './install';
import { newDaoDescribe } from './new-dao';
import { newTokenDescribe } from './new-token';
import { revokeDescribe } from './revoke';
import { upgradeDescribe } from './upgrade';

export const commandsDescribe = (): Suite =>
  describe('Commands', () => {
    actDescribe();

    connectDescribe();

    forwardDescribe();

    grantDescribe();

    installDescribe();

    newDaoDescribe();

    newTokenDescribe();

    revokeDescribe();

    upgradeDescribe();
  });

import { expect } from 'chai';
import type { Signer } from 'ethers';
import { defaultAbiCoder } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import { BindingsSpace } from '../../../../src/BindingsManager';
import type { AragonOS } from '../../../../src/modules/aragonos/AragonOS';
import type { TransactionAction } from '../../../../src/types';
import { addressesEqual } from '../../../../src/utils';

import { createInterpreter } from '../../../test-helpers/cas11';

export const newDaoDescribe = (): Suite =>
  describe('new-dao <daoName>', () => {
    let signer: Signer;

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    it('should create a new dao correctly', async () => {
      const daoName = 'my-evmcrispr-dao';
      const interpreter = createInterpreter(
        `
      load aragonos as ar

      ar:new-dao ${daoName}
    `,
        signer,
      );

      const newDAOActions = await interpreter.interpret();

      const tx = await signer.sendTransaction(
        newDAOActions[0] as TransactionAction,
      );

      const aragonos = interpreter.getModule('aragonos') as AragonOS;

      const receipt = await tx.wait();

      const lastLog = receipt.logs.pop();

      expect(lastLog).to.not.be.undefined;

      const newDAOAddress = defaultAbiCoder.decode(
        ['address'],
        lastLog!.data,
      )[0];

      expect(
        addressesEqual(
          aragonos.bindingsManager.getBinding(
            `_${daoName}`,
            BindingsSpace.ADDR,
          ),
          newDAOAddress,
        ),
        'new DAO binding mismatch',
      ).to.be.true;
    });
  });

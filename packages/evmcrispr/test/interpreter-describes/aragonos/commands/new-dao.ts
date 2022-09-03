import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import type { Action } from '../../../../src';
import { BindingsSpace } from '../../../../src/BindingsManager';
import type { AragonOS } from '../../../../src/modules/aragonos/AragonOS';
import { getAragonRegistrarContract } from '../../../../src/modules/aragonos/utils';
import {
  buildNonceForAddress,
  calculateNewProxyAddress,
} from '../../../../src/utils';
import { createTestAction } from '../../../test-helpers/actions';
import { _aragonEns } from '../../../test-helpers/aragonos';
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

      const aragonos = interpreter.getModule('aragonos') as AragonOS;
      const bareTemplateAddress = (await _aragonEns(
        'bare-template.aragonpm.eth',
        aragonos,
      ))!;
      const aragonRegistrar = await getAragonRegistrarContract(
        signer.provider!,
      );
      const newDAOAddress = calculateNewProxyAddress(
        bareTemplateAddress,
        await buildNonceForAddress(
          bareTemplateAddress,
          0,
          aragonos.signer.provider!,
        ),
      );
      const expectedNewDAOActions: Action[] = [
        createTestAction('newInstance', bareTemplateAddress!),
        {
          to: aragonRegistrar.address,
          data: aragonRegistrar.interface.encodeFunctionData('register', [
            utils.solidityKeccak256(['string'], [daoName]),
            newDAOAddress,
          ]),
        },
      ];

      expect(
        aragonos.bindingsManager.getBinding(`_${daoName}`, BindingsSpace.ADDR),
        'new DAO binding mismatch',
      ).to.eq(newDAOAddress);
      expect(newDAOActions, 'actions mismatch').to.eql(expectedNewDAOActions);
    });
  });

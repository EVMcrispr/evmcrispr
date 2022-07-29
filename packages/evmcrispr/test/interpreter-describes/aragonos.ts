import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import { ErrorInvalid, encodeActCall, encodeCallScript } from '../../src';

import type { AragonDAO } from '../../src/cas11/modules/aragonos/AragonDAO';
import type { AragonOS } from '../../src/cas11/modules/aragonos/AragonOS';
import { encodeAction } from '../../src/cas11/utils/encoders';

import { DAO } from '../fixtures';
import { createInterpreter } from '../test-helpers/cas11';
import { expectThrowAsync } from '../test-helpers/expects';

const createAragonScript = (commands: string[] = []): string => `
  load aragonos as ar
  ar:connect ${DAO.kernel} (
    ${commands.join('\n')}
  )
`;

export const aragonos = (): Mocha.Suite =>
  describe('AragonOS module', () => {
    let signer: Signer;

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    describe('when interpreting connect command', () => {
      it('should set dao global binding', async () => {
        const interpreter = createInterpreter(createAragonScript(), signer);
        await interpreter.interpret();
        const aragonos = interpreter.std.modules[0] as AragonOS;
        const dao = aragonos.getModuleVariable(DAO.kernel) as AragonDAO;

        Object.entries(DAO).forEach(([appIdentifier, appAddress]) => {
          expect(
            dao.resolveApp(appIdentifier).address,
            `${appIdentifier} binding mismatch`,
          ).equals(appAddress);
        });
      });

      it('should fail when not passing a commands block', async () => {
        await expectThrowAsync(
          () =>
            createInterpreter(
              `
            load aragonos as ar
            ar:connect ${DAO.kernel}
          `,
              signer,
            ).interpret(),
          {
            type: ErrorInvalid,
            message:
              'Connect command error: invalid number of arguments. Expected at least 2 and got 1',
          },
        );
      });
    });

    describe('when interpreting an act command', () => {
      it('should interpret a valid one correctly', async () => {
        const interpreter = createInterpreter(
          createAragonScript([
            `act vault vault "deposit(uint,uint[][])" 1 [[2,3],[4,5]]`,
          ]),
          signer,
        );

        const actions = await interpreter.interpret();

        expect(actions).to.be.eql([
          {
            to: DAO.vault,
            data: encodeActCall('forward(bytes)', [
              encodeCallScript([
                encodeAction(DAO.vault, 'deposit(uint,uint[][])', [
                  1,
                  [
                    [2, 3],
                    [4, 5],
                  ],
                ]),
              ]),
            ]),
          },
        ]);
      });
    });
  });

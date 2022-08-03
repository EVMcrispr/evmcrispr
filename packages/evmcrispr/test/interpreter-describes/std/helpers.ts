import { expect } from 'chai';
import type { Signer } from 'ethers';
import { Contract, utils } from 'ethers';
import { ethers } from 'hardhat';

import { CallableExpression, ComparisonType } from '../../../src/cas11/utils';
import {
  itChecksInvalidArgsLength,
  runExpression,
} from '../../test-helpers/cas11';

const { Helper } = CallableExpression;
const { Between, Equal } = ComparisonType;

const toTimestamp = (date?: string): number =>
  (date ? new Date(date) : new Date()).valueOf() / 1000;

export const helpersDescribe = (): Mocha.Suite =>
  describe('Helpers', () => {
    let signer: Signer;
    const lazySigner = () => signer;

    const runHelper = async (helper: string) => {
      return runExpression(helper, signer);
    };

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    describe('@id(value)', () => {
      it('should interpret it correctly', async () => {
        const res = await runHelper(`@id('an example test')`);

        expect(res).to.equals(utils.id('an example test'));
      });

      itChecksInvalidArgsLength(
        Helper,
        '@id',
        ['exampleValue'],
        {
          type: Equal,
          minValue: 1,
        },
        lazySigner,
      );
    });

    describe('@me', () => {
      it('should interpret it correctly', async () => {
        const connectedAccount = await runHelper(`@me`);

        expect(connectedAccount).to.equals(await signer.getAddress());
      });

      itChecksInvalidArgsLength(
        Helper,
        '@me',
        [],
        { type: Equal, minValue: 0 },
        lazySigner,
      );
    });

    describe('@token(tokenSymbol)', () => {
      it('should interpret it correctly', async () => {
        const tokenAddress = await runHelper('@token(DAI)');

        expect(tokenAddress).to.equals(
          '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735',
        );
      });

      itChecksInvalidArgsLength(
        Helper,
        '@token',
        ['DAI'],
        {
          type: Equal,
          minValue: 1,
        },
        lazySigner,
      );
    });

    describe('@token.balance(tokenSymbol, holder)', () => {
      it('should interpret it correctly', async () => {
        const token = new Contract(
          '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735',
          ['function balanceOf(address owner) view returns (uint)'],
          signer,
        );
        const expectedBalance = await token.balanceOf(
          await signer.getAddress(),
        );
        const holderBalance = await runHelper('@token.balance(DAI, @me)');

        expect(holderBalance).to.equals(expectedBalance);
      });

      itChecksInvalidArgsLength(
        Helper,
        '@token.balance',
        ['DAI', '@me'],
        { type: Equal, minValue: 2 },
        lazySigner,
      );
    });

    describe('@date(date, offset?)', () => {
      it('should interpret it correctly', async () => {
        const cases: [() => Promise<string>, number, string][] = [
          [
            () => runHelper('@date(now)'),
            toTimestamp(),
            'current date mismatch',
          ],
          [
            () => runHelper('@date(2015)'),
            toTimestamp('2015'),
            'only year mismatch',
          ],
          [
            () => runHelper('@date(2020-02)'),
            toTimestamp('2020-02'),
            'only year and month mismatch',
          ],
          [
            () => runHelper('@date(2018-01-01)'),
            toTimestamp('2018-01-01'),
            'full date mismatch',
          ],
          [
            () => runHelper('@date(2010-05-11T18:30)'),
            toTimestamp('2010-05-11T18:30'),
            'date and time without seconds mismatch',
          ],
          [
            () => runHelper('@date(2010-05-11T18:30:05)'),
            toTimestamp('2010-05-11T18:30:05'),
            'full format mismatch',
          ],
          [
            () => runHelper('@date(2010-05-11T18:30:05)'),
            toTimestamp('2010-05-11T18:30:05'),
            'full format mismatch',
          ],
          [
            () => runHelper('@date(2009-05-11T09:24:16Z)'),
            toTimestamp('2009-05-11T09:24:16Z'),
            'UTC format mismatch',
          ],
          [
            () => runHelper('@date(2009-05-11T09:24:16-05:00)'),
            toTimestamp('2009-05-11T09:24:16-05:00'),
            'Negative offset UTC format mismatch',
          ],
          [
            () => runHelper('@date(2009-05-11T09:24:16+10:20)'),
            toTimestamp('2009-05-11T09:24:16+10:20'),
            'Positive offset UTC format mismatch',
          ],
          [
            () => runHelper('@date(2010-05-05, -2y)'),
            toTimestamp('2008-05-05'),
            'Date with negative offset param mismatch',
          ],
          [
            () => runHelper('@date(2010-05-05, -2y)'),
            toTimestamp('2008-05-05'),
            'Date with negative offset param mismatch',
          ],
          [
            () => runHelper('@date(2010-05-05, -2y)'),
            toTimestamp('2008-05-05'),
            'Date with negative yearly offset param mismatch',
          ],
          [
            () => runHelper('@date(2010-05-05, -2y-1mo)'),
            toTimestamp('2008-04-05'),
            'Date with negative yearly and mothly offset param mismatch',
          ],
          [
            () => runHelper('@date(2010-05-05, -2y-1mo-5w)'),
            toTimestamp('2008-03-01'),
            'Date with negative yearly, mothly and weekly offset param mismatch',
          ],
          [
            () => runHelper('@date(2010-05-05, -2y-1mo-5w-1h)'),
            toTimestamp('2008-02-29T23:00Z'),
            'Date with negative yearly, mothly, weekly and hourly offset param mismatch',
          ],
          [
            () => runHelper('@date(2010-05-05, -2y-1mo-5w-1h-30m)'),
            toTimestamp('2008-02-29T22:30Z'),
            'Date with negative yearly, mothly, weekly, hourly and minutely offset param mismatch',
          ],
          [
            () => runHelper('@date(2010-05-05, -2y-1mo-5w-1h-30m-15s)'),
            toTimestamp('2008-02-29T22:29:45Z'),
            'Date with negative yearly, mothly, weekly, hourly, minutely and secondly offset param mismatch',
          ],

          [
            () => runHelper('@date(2010-05-05, +2y)'),
            toTimestamp('2012-05-04'),
            'Date with positive yearly offset param mismatch',
          ],
          [
            () => runHelper('@date(2010-05-05, +2y+1mo)'),
            toTimestamp('2012-06-03'),
            'Date with positive yearly and mothly offset param mismatch',
          ],
          [
            () => runHelper('@date(2010-05-05, +2y+1mo+5w)'),
            toTimestamp('2012-07-08'),
            'Date with positive yearly, mothly and weekly offset param mismatch',
          ],
          [
            () => runHelper('@date(2010-05-05, +2y+1mo+5w+5h)'),
            toTimestamp('2012-07-08T05:00Z'),
            'Date with positive yearly, mothly, weekly and hourly offset param mismatch',
          ],
          [
            () => runHelper('@date(2010-05-05, +2y+1mo+5w+5h+40m)'),
            toTimestamp('2012-07-08T05:40Z'),
            'Date with positive yearly, mothly, weekly, hourly and minutely offset param mismatch',
          ],
          [
            () => runHelper('@date(2010-05-05, +2y+1mo+5w+5h+40m+25s)'),
            toTimestamp('2012-07-08T05:40:25Z'),
            'Date with positive yearly, mothly, weekly, hourly, minutely and secondly offset param mismatch',
          ],
        ];

        for (const [valueFn, expectedValue, errorMsg] of cases) {
          const value = await valueFn();

          expect(value).to.equals(
            Math.floor(expectedValue).toString(),
            errorMsg,
          );
        }
      });

      itChecksInvalidArgsLength(
        Helper,
        '@date',
        ['2010-05-05', '+2y'],
        {
          type: Between,
          minValue: 1,
          maxValue: 2,
        },
        lazySigner,
      );
    });
  });

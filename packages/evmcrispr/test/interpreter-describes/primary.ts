import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import type { NumericLiteralNode } from '../../src/cas11/types';
import { NodeType } from '../../src/cas11/types';
import { timeUnits, toDecimals } from '../../src/utils';
import type { InterpreterCase } from '../test-helpers/cas11';
import { runInterpreterCases } from '../test-helpers/cas11';

export const primary = (): Mocha.Suite =>
  describe('Primary interpreters', async () => {
    let signer: Signer;

    before(async () => {
      [signer] = await ethers.getSigners();
    });
    describe('when interpreting a literal node', () => {
      it('should interpret address node correctly', async () => {
        const c: InterpreterCase = [
          {
            type: NodeType.AddressLiteral,
            value: '0x83E57888cd55C3ea1cfbf0114C963564d81e318d',
          },
          '0x83E57888cd55C3ea1cfbf0114C963564d81e318d',
        ];

        await runInterpreterCases(c, signer);
      });

      it('should interpret a boolean node correctly', async () => {
        const cases: InterpreterCase[] = [
          [
            {
              type: NodeType.BoolLiteral,
              value: false,
            },
            false,
          ],
          [{ type: NodeType.BoolLiteral, value: true }, true],
        ];

        await runInterpreterCases(cases, signer);
      });

      it('should intepret a bytes node correctly', async () => {
        const cases: InterpreterCase[] = [
          [
            {
              type: NodeType.BytesLiteral,
              value:
                '0x0e80f0b30000000000000000000000008e6cd950ad6ba651f6dd608dc70e5886b1aa6b240000000000000000000000002f00df4f995451e0df337b91744006eb8892bfb10000000000000000000000000000000000000000000000004563918244f40000',
            },
            '0x0e80f0b30000000000000000000000008e6cd950ad6ba651f6dd608dc70e5886b1aa6b240000000000000000000000002f00df4f995451e0df337b91744006eb8892bfb10000000000000000000000000000000000000000000000004563918244f40000',
          ],
        ];

        await runInterpreterCases(cases, signer);
      });

      it('should intepret a numeric node correctly', async () => {
        const node = (
          value: number,
          power?: number,
          timeUnit?: string,
        ): NumericLiteralNode => {
          const n: NumericLiteralNode = {
            type: NodeType.NumberLiteral,
            value,
          };
          if (power) n.power = power;
          if (timeUnit) n.timeUnit = timeUnit;

          return n;
        };

        const cases: InterpreterCase[] = [
          [node(15), toDecimals(15, 0), 'Invalid integer number match'],
          [
            node(1500, 18),
            toDecimals(1500, 18),
            'Invalid integer number raised to a power match',
          ],
          [
            node(7854.2345),
            toDecimals(7854.2345, 0),
            'Invalid decimal number raised to a power match',
          ],
          [
            node(0.000123, 14),
            toDecimals(0.000123, 14),
            'Invalid zero decimal number raised to a power match ',
          ],
          [
            node(1200.12, 18, 'mo'),
            toDecimals(1200.12, 18).mul(timeUnits['mo']),
            'Invalid decimal number raised to a power followed by time unit match',
          ],
          [
            node(30, undefined, 's'),
            toDecimals(30, 0).mul(timeUnits['s']),
            'Invalid number followed by second time unit match',
          ],
          [
            node(5, undefined, 'm'),
            toDecimals(5, 0).mul(timeUnits['m']),
            'Invalid number followed by minute time unit match',
          ],
          [
            node(35, undefined, 'h'),
            toDecimals(35, 0).mul(timeUnits['h']),
            'Invalid number followed by hour time unit match',
          ],
          [
            node(463, undefined, 'd'),
            toDecimals(463, 0).mul(timeUnits['d']),
            'Invalid number followed by day time unit match',
          ],
          [
            node(96, undefined, 'w'),
            toDecimals(96, 0).mul(timeUnits['w']),
            'Invalid number followed by week time unit match',
          ],
          [
            node(9, undefined, 'mo'),
            toDecimals(9, 0).mul(timeUnits['mo']),
            'Invalid number followed by month time unit match',
          ],
          [
            node(4.67, undefined, 'y'),
            toDecimals(4.67, 0).mul(timeUnits['y']),
            'Invalid number followed by year time unit match',
          ],
        ];

        await runInterpreterCases(cases, signer);
      });

      it('should intepret a string node correctly', async () => {
        const cases: InterpreterCase[] = [
          [
            {
              type: NodeType.StringLiteral,
              value: 'This is a string node',
            },
            'This is a string node',
          ],
        ];

        await runInterpreterCases(cases, signer);
      });
    });

    describe('when intepreting an identifier node', () => {
      it('should intepret an identifier correctly');
      it('should interpret a variable correctly');
    });
  });

import type { Case } from '@1hive/evmcrispr-test-common';
import type { BigNumber, Signer } from 'ethers';
import { constants } from 'ethers';

import type { Node } from '../../src';
import { Cas11AST, EVMcrispr } from '../../src';

import type { NumericLiteralNode } from '../../src/types';
import { NodeType } from '../../src/types';
import { timeUnits, toDecimals } from '../../src/utils';

function numericNode(
  value: number,
  power?: number,
  timeUnit?: string,
): NumericLiteralNode {
  const n: NumericLiteralNode = {
    type: NodeType.NumberLiteral,
    value: String(value),
  };
  if (power) n.power = power;
  if (timeUnit) n.timeUnit = timeUnit;

  return n;
}

describe.concurrent('Interpreter - primaries', async () => {
  let signer: Signer;
  const getSigner = async () => signer;

  async function expectPrimaryInterpretation(
    primaryNode: Node,
    expectedPrimaryValue: any,
  ): Promise<void> {
    const interpretFn = new EVMcrispr(
      new Cas11AST([]),
      getSigner,
    ).interpretNode(primaryNode);

    await expect(interpretFn).resolves.toStrictEqual(expectedPrimaryValue);
  }

  beforeAll(async (ctx) => {
    [signer] = await ctx.file!.utils.getWallets();
  });

  describe.concurrent('when interpreting a literal node', () => {
    it('should interpret address node correctly', async () => {
      const primaryValue = '0x83E57888cd55C3ea1cfbf0114C963564d81e318d';
      await expectPrimaryInterpretation(
        {
          type: NodeType.AddressLiteral,
          value: primaryValue,
        },
        primaryValue,
      );
    });

    describe.each<Case<Node, boolean>>([
      {
        title: '"true"',
        value: { type: NodeType.BoolLiteral, value: true },
        expected: true,
      },
      {
        title: '"false"',
        value: {
          type: NodeType.BoolLiteral,
          value: false,
        },
        expected: false,
      },
    ])('when interpreting boolean nodes', ({ title, value, expected }) => {
      it(`should interpret ${title} value correctly`, async () => {
        await expectPrimaryInterpretation(value as Node, expected);
      });
    });

    it('should intepret a bytes node correctly', async () => {
      const expectedPrimaryValue =
        '0x0e80f0b30000000000000000000000008e6cd950ad6ba651f6dd608dc70e5886b1aa6b240000000000000000000000002f00df4f995451e0df337b91744006eb8892bfb10000000000000000000000000000000000000000000000004563918244f40000';
      await expectPrimaryInterpretation(
        {
          type: NodeType.BytesLiteral,
          value: expectedPrimaryValue,
        },
        expectedPrimaryValue,
      );
    });

    describe.each<Case<Node, BigNumber>>([
      { title: 'integer', value: numericNode(15), expected: toDecimals(15, 0) },
      {
        title: 'integer raised to a power',
        value: numericNode(1500, 18),
        expected: toDecimals(1500, 18),
      },
      {
        title: 'decimal raised to power',
        value: numericNode(7854.2345, 16),
        expected: toDecimals(7854.2345, 16),
      },
      {
        title: 'zero decimal raised to a power',
        value: numericNode(0.000123, 14),
        expected: toDecimals(0.000123, 14),
      },
      {
        title: 'decimal raised to a power followed by time unit',
        value: numericNode(1200.12, 18, 'mo'),
        expected: toDecimals(1200.12, 18).mul(timeUnits['mo']),
      },
      {
        title: 'number followed by secondly time unit',
        value: numericNode(30, undefined, 's'),
        expected: toDecimals(30, 0).mul(timeUnits['s']),
      },
      {
        title: 'number followed by minutely time unit',
        value: numericNode(5, undefined, 'm'),
        expected: toDecimals(5, 0).mul(timeUnits['m']),
      },
      {
        title: 'number followed by hourly time unit',
        value: numericNode(35, undefined, 'h'),
        expected: toDecimals(35, 0).mul(timeUnits['h']),
      },
      {
        title: 'number followed by daily time unit',
        value: numericNode(463, undefined, 'd'),
        expected: toDecimals(463, 0).mul(timeUnits['d']),
      },
      {
        title: 'number followed by weekly time unit',
        value: numericNode(96, undefined, 'w'),
        expected: toDecimals(96, 0).mul(timeUnits['w']),
      },
      {
        title: 'number followed by monthly time unit',
        value: numericNode(9, undefined, 'mo'),
        expected: toDecimals(9, 0).mul(timeUnits['mo']),
      },
      {
        title: 'number followed by yearly time unit',
        value: numericNode(4.67, undefined, 'y'),
        expected: toDecimals(4.67, 0).mul(timeUnits['y']),
      },
    ])('when interpreting numeric nodes', ({ title, value, expected }) => {
      it(`should interpret a ${title} value correctly`, async () => {
        await expectPrimaryInterpretation(value, expected);
      });
    });

    it('should intepret a string node correctly', async () => {
      const expectedPrimaryValue = 'This is a string node';

      await expectPrimaryInterpretation(
        {
          type: NodeType.StringLiteral,
          value: expectedPrimaryValue,
        },
        expectedPrimaryValue,
      );
    });
  });

  describe.concurrent.each<Case<Node, string>>([
    {
      title: '',
      value: {
        type: NodeType.ProbableIdentifier,
        value: 'token-manager.open#3',
      },
      expected: 'token-manager.open#3',
    },
    {
      title: 'default native token',
      value: {
        type: NodeType.ProbableIdentifier,
        value: 'ETH',
      },
      expected: constants.AddressZero,
    },
  ])(
    'when interpreting a probable identifier node',
    ({ title, value, expected }) => {
      it(`should interpret a ${title} identifier correctly`, async () => {
        await expectPrimaryInterpretation(value, expected);
      });
    },
  );

  describe.todo('when intepreting a variable node', () => {
    it.todo('should interpret a variable correctly');
    it.todo('should fail when intepreting a non-existent variable');
  });
});

import type { ErrorException } from '@1hive/evmcrispr';
import { ErrorInvalid } from '@1hive/evmcrispr';
import { expect } from 'chai';

const HASH_REGEX = /^0x[a-zA-Z0-9]{64}$/;

export const expectHash = (hash: string, message?: string): void => {
  expect(HASH_REGEX.test(hash), message).to.be.true;
};

export const expectThrowAsync = async (
  method: () => any,
  expectedError?: ErrorException,
  customTestMessage = '',
): Promise<void> => {
  let error: Error | null = null;
  try {
    await method();
  } catch (err: any) {
    error = err;
  }
  const type = expectedError
    ? expectedError.constructor
    : new Error().constructor;
  const { name, message } = expectedError || {};

  expect(error, `Exception not thrown`).not.to.be.null;

  if (message && message.length) {
    expect(error!.message, customTestMessage).to.equal(message);
  }

  expect(error!.constructor.name, customTestMessage).eq(type.name);

  if (name) {
    expect(error!.name, customTestMessage).to.be.eq(name);
  }
};

export const isValidIdentifier = (
  evmcrisprMethod: (invalidIdentifier: string) => any,
  checkLabeledAppIdentifier = false,
  checkAppIdentifier = false,
): (() => Promise<void>) => {
  return async () => {
    const expectedError = new ErrorInvalid('', {
      name: 'ErrorInvalidIdentifier',
    });

    await expectThrowAsync(
      evmcrisprMethod(''),
      expectedError,
      'Empty identifier',
    );

    await expectThrowAsync(
      evmcrisprMethod('Vault'),
      expectedError,
      'Uppercase letter in identifier',
    );

    await expectThrowAsync(
      evmcrisprMethod('vault:'),
      expectedError,
      'Incomplete identifier',
    );

    await expectThrowAsync(
      evmcrisprMethod('vault%'),
      expectedError,
      'Invalid character in identifier',
    );

    await expectThrowAsync(
      evmcrisprMethod('vault.'),
      expectedError,
      'Incomplete repository in identifier',
    );

    if (checkLabeledAppIdentifier) {
      await expectThrowAsync(
        evmcrisprMethod('vault:new-vau/lt'),
        expectedError,
        'Label containing invalid character',
      );
    }

    if (checkAppIdentifier) {
      await expectThrowAsync(
        evmcrisprMethod('vault:2new'),
        expectedError,
        'Index containing non-numeric character',
      );
    }
  };
};

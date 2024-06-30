import { expect } from "chai";

import type { ErrorException } from "../../src/errors";

const HASH_REGEX = /^0x[a-zA-Z0-9]{64}$/;

export const expectHash = (hash: string, message?: string): void => {
  expect(HASH_REGEX.test(hash), message).to.be.true;
};

export const expectThrowAsync = async (
  method: () => any,
  expectedError?: ErrorException,
  customTestMessage = "",
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

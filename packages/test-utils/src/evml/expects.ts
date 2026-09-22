import type { ErrorException } from "@evmcrispr/sdk";
import { expect } from "chai";

const HASH_REGEX = /^0x[a-zA-Z0-9]{64}$/;

export const expectHash = (hash: string, message?: string): void => {
  expect(HASH_REGEX.test(hash), message).to.be.true;
};

/**
 * Assert an already-thrown failure against the message matcher an error case
 * carries: a substring, a pattern, or an `ErrorException` whose message (when
 * non-empty) and class must match. Unlike `expectThrowAsync` it does not run
 * the script again — the caller has the failure in hand, e.g. because it also
 * checked a declared error on it.
 */
export const assertErrorMatches = (
  thrown: unknown,
  expected: string | RegExp | ErrorException,
): void => {
  const error = thrown as Error;
  if (typeof expected === "string") {
    expect(error.message).to.include(expected);
    return;
  }
  if (expected instanceof RegExp) {
    expect(error.message).to.match(expected);
    return;
  }
  if (expected.message?.length) {
    expect(error.message).to.equal(expected.message);
  }
  expect(error.constructor.name).to.equal(expected.constructor.name);
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

  if (message?.length) {
    expect(error!.message, customTestMessage).to.equal(message);
  }

  expect(error!.constructor.name, customTestMessage).eq(type.name);

  if (name) {
    expect(error!.name, customTestMessage).to.be.eq(name);
  }
};

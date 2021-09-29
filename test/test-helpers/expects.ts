import { expect } from "chai";
import { ErrorInvalid } from "../../src";

export const expectThrowAsync = async (
  method: () => any,
  errorOptions: { type: any; name?: string; message?: string } = { type: Error },
  customTestMessage = ""
): Promise<void> => {
  let error: Error | null = null;
  try {
    await method();
  } catch (err: any) {
    error = err;
  }
  const { type, name, message } = errorOptions;

  expect(error, `Exception not thrown`).not.to.be.null;
  expect(error!.constructor.name, customTestMessage).eq(type.name);

  if (name) {
    expect(error!.name, customTestMessage).to.be.eq(name);
  }

  if (message) {
    expect(error!.message, customTestMessage).to.equal(message);
  }
};

export const isValidIdentifier = (
  evmcrisprMethod: (invalidIdentifier: string) => any,
  checkLabeledAppIdentifier = false,
  checkAppIdentifier = false
): (() => Promise<void>) => {
  return async () => {
    const errorOptions = { type: ErrorInvalid, name: "ErrorInvalidIdentifier" };

    await expectThrowAsync(evmcrisprMethod(""), errorOptions, "Empty identifier");

    await expectThrowAsync(evmcrisprMethod("Vault"), errorOptions, "Uppercase letter in identifier");

    await expectThrowAsync(evmcrisprMethod("vault:"), errorOptions, "Incomplete identifier");

    await expectThrowAsync(evmcrisprMethod("vault%"), errorOptions, "Invalid character in identifier");

    await expectThrowAsync(evmcrisprMethod("vault."), errorOptions, "Incomplete repository in identifier");

    if (checkLabeledAppIdentifier) {
      await expectThrowAsync(evmcrisprMethod("vault:new-vau/lt"), errorOptions, "Label containing invalid character");
    }

    if (checkAppIdentifier) {
      await expectThrowAsync(evmcrisprMethod("vault:2new"), errorOptions, "Index containing non-numeric character");
    }
  };
};

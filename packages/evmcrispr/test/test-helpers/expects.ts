import { expect } from "chai";
import { utils } from "ethers";
import { cid } from "is-ipfs";

import type { ErrorException } from "../../src/errors";
import { ErrorInvalid } from "../../src/errors";
import type {
  AragonArtifact,
  ParsedApp,
} from "../../src/modules/aragonos/types";
import { parseContentUri } from "../../src/modules/aragonos/utils";

const { isAddress } = utils;

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

export const isValidArtifact = (artifact: AragonArtifact): void => {
  const { appName, abi, roles } = artifact;

  expect(appName, "Artifact name not found").to.not.be.null;

  expect(abi.length, "Artifact ABI not found").to.be.greaterThan(0);

  roles.forEach(({ bytes, id, name }) => {
    expectHash(bytes, "Invalid artifact role hash");
    expect(id, "Artifact role id not found").to.not.be.empty;
    expect(name, "Artifact role name not found").to.not.be.empty;
  });
};

export const isValidIdentifier = (
  evmcrisprMethod: (invalidIdentifier: string) => any,
  checkLabeledAppIdentifier = false,
  checkAppIdentifier = false,
): (() => Promise<void>) => {
  return async () => {
    const expectedError = new ErrorInvalid("", {
      name: "ErrorInvalidIdentifier",
    });

    await expectThrowAsync(
      evmcrisprMethod(""),
      expectedError,
      "Empty identifier",
    );

    await expectThrowAsync(
      evmcrisprMethod("Vault"),
      expectedError,
      "Uppercase letter in identifier",
    );

    await expectThrowAsync(
      evmcrisprMethod("vault:"),
      expectedError,
      "Incomplete identifier",
    );

    await expectThrowAsync(
      evmcrisprMethod("vault%"),
      expectedError,
      "Invalid character in identifier",
    );

    await expectThrowAsync(
      evmcrisprMethod("vault."),
      expectedError,
      "Incomplete repository in identifier",
    );

    if (checkLabeledAppIdentifier) {
      await expectThrowAsync(
        evmcrisprMethod("vault:new-vau/lt"),
        expectedError,
        "Label containing invalid character",
      );
    }

    if (checkAppIdentifier) {
      await expectThrowAsync(
        evmcrisprMethod("vault:2new"),
        expectedError,
        "Index containing non-numeric character",
      );
    }
  };
};

export const isValidParsedApp = (app: ParsedApp): void => {
  const { address, appId, artifact, codeAddress, contentUri, name, roles } =
    app;

  expect(isAddress(address), "Invalid app address").to.be.true;

  expectHash(appId, "Invalid appId");

  expect(isAddress(codeAddress), "Invalid app code address").to.be.true;

  if (contentUri) {
    expect(cid(parseContentUri(contentUri)), "Invalid contentUri").to.be.true;
  }

  expect(name, "App name missing").to.not.be.empty;

  expect(app).has.property("artifact");

  if (artifact) {
    isValidArtifact(artifact);
  }

  roles.forEach(({ manager, grantees, roleHash }) => {
    expect(isAddress(manager), "Invalid app role manager").to.be.true;

    grantees.forEach(({ granteeAddress }) => {
      expect(isAddress(granteeAddress), "Invalid app role grantee address").to
        .be.true;
    });

    expectHash(roleHash, "Invalid app role hash");
  });
};

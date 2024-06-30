import { expect } from "chai";
import { multihash } from "is-ipfs";

import { isAddress } from "viem";

import { ErrorInvalid } from "../../../../src/errors";
import type {
  AragonArtifact,
  ParsedApp,
} from "../../../../src/modules/aragonos/types";
import { parseContentUri } from "../../../../src/modules/aragonos/utils";
import { expectThrowAsync } from "../../../test-helpers/expects";

const HASH_REGEX = /^0x[a-zA-Z0-9]{64}$/;

export const expectHash = (hash: string, message?: string): void => {
  expect(HASH_REGEX.test(hash), message).to.be.true;
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
    expect(multihash(parseContentUri(contentUri)), "Invalid contentUri").to.be
      .true;
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

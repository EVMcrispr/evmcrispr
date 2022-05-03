import { isAddress } from "@ethersproject/address";
import { expect } from "chai";
import isIpfs from "is-ipfs";
import { ErrorInvalid } from "../../src";
import { parseContentUri } from "../../src/helpers";
import { AragonArtifact, ParsedApp } from "../../src/types";

const HASH_REGEX = /^0x[a-zA-Z0-9]{64}$/;

export const expectHash = (hash: string, message?: string): void => {
  expect(HASH_REGEX.test(hash), message).to.be.true;
};

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

export const isValidParsedApp = (app: ParsedApp): void => {
  const { address, appId, artifact, codeAddress, contentUri, name, roles } = app;

  expect(isAddress(address), "Invalid app address").to.be.true;

  expectHash(appId, "Invalid appId");

  expect(isAddress(codeAddress), "Invalid app code address").to.be.true;

  if (contentUri) {
    expect(isIpfs.multihash(parseContentUri(contentUri)), "Invalid contentUri").to.be.true;
  }

  expect(name, "App name missing").to.not.be.empty;

  expect(app).has.property("artifact");

  if (artifact) {
    isValidArtifact(artifact);
  }

  roles.forEach(({ manager, grantees, roleHash }) => {
    expect(isAddress(manager), "Invalid app role manager").to.be.true;

    grantees.forEach(({ granteeAddress }) => {
      expect(isAddress(granteeAddress), "Invalid app role grantee address").to.be.true;
    });

    expectHash(roleHash, "Invalid app role hash");
  });
};

import type { ParsedApp } from "@evmcrispr/module-aragonos/types";
import { expect } from "@evmcrispr/test-utils";
import { multihash } from "is-ipfs";
import { isAddress } from "viem";

const HASH_REGEX = /^0x[a-zA-Z0-9]{64}$/;

export const expectHash = (hash: string, message?: string): void => {
  expect(HASH_REGEX.test(hash), message).to.be.true;
};

export const isValidParsedApp = (app: ParsedApp): void => {
  const { address, appId, codeAddress, contentUri, name, roles } = app;

  expect(isAddress(address), "Invalid app address").to.be.true;

  expectHash(appId, "Invalid appId");

  expect(isAddress(codeAddress), "Invalid app code address").to.be.true;

  if (contentUri) {
    expect(multihash(contentUri.split(":").pop()!), "Invalid contentUri").to.be
      .true;
  }

  expect(name, "App name missing").to.not.be.empty;

  roles.forEach(({ manager, grantees, roleHash }) => {
    expect(isAddress(manager), "Invalid app role manager").to.be.true;

    grantees.forEach(({ granteeAddress }) => {
      expect(isAddress(granteeAddress), "Invalid app role grantee address").to
        .be.true;
    });

    expectHash(roleHash, "Invalid app role hash");
  });
};

import { describe, it } from "bun:test";
import { derivePublicKey, loadPoseidon2 } from "@evmcrispr/module-zk";
import { expect } from "@evmcrispr/test-utils";
import { deriveIdentity, IDENTITY_MESSAGE } from "../../src/utils/identity";
import {
  ANVIL0_COMMITMENT,
  ANVIL0_SIGNATURE,
  TEST_SEED_COMMITMENT,
  TEST_SEED_SECRET_SCALAR,
} from "../fixtures/vectors";

describe("semaphore utils > identity", () => {
  it("pins the identity message", () => {
    // Changing this string rotates every wallet-derived identity.
    expect(IDENTITY_MESSAGE).to.equal("EVMcrispr Semaphore v4 identity");
  });

  it("derives the pinned seed identity", async () => {
    const identity = await deriveIdentity("test seed");
    expect(identity.commitment).to.equal(TEST_SEED_COMMITMENT);
    expect(identity.secretScalar).to.equal(TEST_SEED_SECRET_SCALAR);
  });

  it("derives the pinned anvil-#0 wallet identity", async () => {
    const identity = await deriveIdentity(ANVIL0_SIGNATURE);
    expect(identity.commitment).to.equal(ANVIL0_COMMITMENT);
  });

  it("commitment is poseidon2 of the public key", async () => {
    const identity = await deriveIdentity("test seed");
    const [x, y] = await derivePublicKey("test seed");
    const poseidon2 = await loadPoseidon2();
    expect(identity.commitment).to.equal(poseidon2(x, y));
    expect(identity.publicKey).to.deep.equal([x, y]);
  });
});

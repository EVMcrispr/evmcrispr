import "../../setup";
import { beforeEach, describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { mainnet } from "viem/chains";
import {
  BURN_HASH,
  createCctpRunner,
  MESSAGE,
} from "../../fixtures/cctp-transfer";
import { irisState } from "../../fixtures/msw-handlers";

const ATTESTATION = `0x${"ab".repeat(65)}`;

/** Interpret the script and collect what `print` emitted. */
async function statusOf(usedNonce: bigint): Promise<string[]> {
  const evm = createCctpRunner(mainnet.id, usedNonce);
  const logs: string[] = [];
  evm.registerLogListener((message) => logs.push(message));
  await evm.interpret(`load bridges
print @bridges:status(${BURN_HASH} CCTPv2 mainnet)`);
  return logs;
}

describe("Bridges > helpers > @bridges:status", () => {
  beforeEach(() => irisState.reset());

  it("is pending while Circle has not attested the burn", async () => {
    irisState.messages = [
      {
        status: "pending_confirmations",
        message: MESSAGE,
        attestation: "PENDING",
      },
    ];
    expect(await statusOf(0n)).to.include("pending");
  });

  it("is claimable once attested and not yet minted", async () => {
    irisState.messages = [
      { status: "complete", message: MESSAGE, attestation: ATTESTATION },
    ];
    // usedNonces() == 0 on the destination: the mint hasn't happened.
    expect(await statusOf(0n)).to.include("claimable");
  });

  it("is done once the destination has used the nonce", async () => {
    irisState.messages = [
      { status: "complete", message: MESSAGE, attestation: ATTESTATION },
    ];
    expect(await statusOf(1n)).to.include("done");
  });

  it("rejects a transferId that is not a transaction hash", async () => {
    const evm = createCctpRunner(mainnet.id);
    let error: Error | undefined;
    try {
      await evm.interpret(`load bridges
print @bridges:status(0xdeadbeef)`);
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).to.include(
      "<transferId> must be the source-chain transaction hash",
    );
  });
});

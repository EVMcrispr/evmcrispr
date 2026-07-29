import "../../setup";
import { beforeEach, describe, it } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { decodeFunctionData, parseAbi } from "viem";
import { base, mainnet } from "viem/chains";
import { decodeCctpMessage } from "../../../src/adapters/lib/cctpMessage";
import { CCTP_MESSAGE_TRANSMITTER } from "../../fixtures";
import {
  BURN_HASH,
  createCctpRunner,
  DEST_DOMAIN,
  MESSAGE,
} from "../../fixtures/cctp-transfer";
import { irisState } from "../../fixtures/msw-handlers";

const transmitterAbi = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) returns (bool)",
]);

const ATTESTATION = `0x${"ab".repeat(65)}`;

// `claim` and `@bridges:status` examples are hand-written in claim.md and
// status.md (below the HAND-WRITTEN marker): both need a real source
// transaction hash, which a docCase can't execute against.

describe("Bridges > commands > claim (CCTPv2)", () => {
  beforeEach(() => irisState.reset());

  it("builds receiveMessage with Circle's attestation once it is complete", async () => {
    irisState.messages = [
      { status: "complete", message: MESSAGE, attestation: ATTESTATION },
    ];

    // The burn targets Base, so the claim runs there.
    const evm = createCctpRunner(base.id);
    const actions: Action[] = await evm.interpret(`load bridges
bridges:claim ${BURN_HASH} --from-chain mainnet`);

    const txs = actions.filter(isTransactionAction);
    expect(txs).to.have.length(1);
    expect(txs[0].to).to.eq(CCTP_MESSAGE_TRANSMITTER);

    const call = decodeFunctionData({
      abi: transmitterAbi,
      data: txs[0].data!,
    });
    expect(call.functionName).to.eq("receiveMessage");
    expect(call.args[0]).to.eq(MESSAGE);
    expect(call.args[1]).to.eq(ATTESTATION);

    // Sanity: the message really does target Base.
    expect(decodeCctpMessage(MESSAGE).destinationDomain).to.eq(DEST_DOMAIN);
  });

  it("detects the adapter from the source receipt without --using", async () => {
    irisState.messages = [
      { status: "complete", message: MESSAGE, attestation: ATTESTATION },
    ];
    const evm = createCctpRunner(base.id);
    const actions = await evm.interpret(`load bridges
bridges:claim ${BURN_HASH} --from-chain mainnet`);
    expect(actions.filter(isTransactionAction)).to.have.length(1);
  });

  it("refuses to claim before the attestation is ready", async () => {
    irisState.messages = [
      {
        status: "pending_confirmations",
        message: MESSAGE,
        attestation: "PENDING",
      },
    ];
    const evm = createCctpRunner(base.id);
    let error: Error | undefined;
    try {
      await evm.interpret(`load bridges
bridges:claim ${BURN_HASH} --from-chain mainnet`);
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).to.include("hasn't attested this transfer yet");
  });

  it("rejects claiming on the wrong chain", async () => {
    irisState.messages = [
      { status: "complete", message: MESSAGE, attestation: ATTESTATION },
    ];
    const evm = createCctpRunner(mainnet.id); // the burn targets Base
    let error: Error | undefined;
    try {
      await evm.interpret(`load bridges
bridges:claim ${BURN_HASH} --from-chain mainnet`);
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).to.include(
      "this CCTP transfer targets chain 8453; switch to it before claiming",
    );
  });

  it("rejects a transferId that is not a transaction hash", async () => {
    const evm = createCctpRunner(base.id);
    let error: Error | undefined;
    try {
      await evm.interpret(`load bridges
bridges:claim 0xdeadbeef --from-chain mainnet`);
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).to.include(
      "<transferId> must be the source-chain transaction hash",
    );
  });
});

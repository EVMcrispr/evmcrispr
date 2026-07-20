import "../../setup";
import { beforeAll, beforeEach, describe, it } from "bun:test";
import { type Action, isWalletAction } from "@evmcrispr/sdk";
import { expect, getTransports, getWalletClients } from "@evmcrispr/test-utils";
import { describeCommand, evml, Interpreter } from "@evmcrispr/test-utils/evml";
import type { WalletClient } from "viem";
import { recoverMessageAddress } from "viem";
import { gnosis } from "viem/chains";
import {
  recordedBoosts,
  recordedLogins,
  TEST_NONCE,
} from "../../fixtures/msw-handlers";

describeCommand("boost", {
  describeName: "Giveth > commands > boost <projects> [--with <percentages>]",
  module: "giveth",
  preamble: "load giveth",
  errorCases: [
    {
      name: "fails when --with length does not match the projects",
      script: "giveth:boost [evmcrispr wayback-machine] --with [100]",
      error: "--with length (1) does not match <projects> length (2)",
    },
    {
      name: "fails when the percentages don't sum to 100",
      script: "giveth:boost [evmcrispr wayback-machine] --with [50 40]",
      error: "--with percentages must sum to 100, got 90",
    },
    {
      name: "fails on out-of-range percentages",
      script: "giveth:boost [evmcrispr wayback-machine] --with [110 10]",
      error: "must be numbers between 0 (exclusive) and 100, got 110",
    },
    {
      name: "fails on zero percentages",
      script: "giveth:boost [evmcrispr wayback-machine] --with [100 0]",
      error: "must be numbers between 0 (exclusive) and 100, got 0",
    },
    {
      name: "fails on duplicate slugs",
      script: "giveth:boost [evmcrispr evmcrispr] --with [50 50]",
      error: "<projects> contains duplicate slugs",
    },
    {
      name: "fails on more than 20 projects",
      script: `giveth:boost [${Array.from({ length: 21 }, (_, i) => `project${i}`).join(" ")}]`,
      error: "Giveth allows boosting at most 20 projects, got 21",
    },
    {
      name: "fails without an execution context",
      script: "giveth:boost [evmcrispr wayback-machine] --with [70 30]",
      error: "boost requires an execution context with wallet access",
    },
  ],
});

describe("Giveth > commands > boost > with wallet", () => {
  let walletClient: WalletClient;

  beforeAll(() => {
    walletClient = getWalletClients()[0];
  });

  beforeEach(() => {
    recordedBoosts.length = 0;
    recordedLogins.length = 0;
  });

  const runBoost = async (script: string) => {
    const account = walletClient.account!;
    const evm = new Interpreter(evml.registry, {
      account: account.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

    const actionCallback = async (action: Action) => {
      if (isWalletAction(action) && action.method === "personal_sign") {
        return walletClient.signMessage({
          account,
          message: action.params[0],
        });
      }
      throw new Error("Unexpected action type");
    };

    return evm.interpret(`load giveth\n${script}`, actionCallback);
  };

  it("signs in with SIWE and replaces the boost allocation", async () => {
    const actions = await runBoost(
      "giveth:boost [evmcrispr wayback-machine] --with [70 30]",
    );
    expect(actions).to.eql([]);

    expect(recordedLogins).to.have.length(1);
    const login = recordedLogins[0];
    expect(login.message).to.include(
      "wants you to sign in with your Ethereum account",
    );
    expect(login.message).to.include("Login into Giveth services");
    expect(login.message).to.include(`Nonce: ${TEST_NONCE}`);
    const signer = await recoverMessageAddress({
      message: login.message,
      signature: login.signature as `0x${string}`,
    });
    expect(signer).to.eq(walletClient.account!.address);

    expect(recordedBoosts).to.eql([
      { projectIds: [1350, 2000], percentages: [70, 30], authVersion: "2" },
    ]);
  });

  it("splits the allocation evenly when --with is omitted", async () => {
    await runBoost("giveth:boost [evmcrispr wayback-machine]");
    expect(recordedBoosts).to.have.length(1);
    expect(recordedBoosts[0].percentages).to.eql([50, 50]);
  });

  it("puts the rounding remainder of an uneven split on the first project", async () => {
    await runBoost(
      "giveth:boost [evmcrispr wayback-machine the-giveth-community-of-makers]",
    );
    expect(recordedBoosts).to.have.length(1);
    expect(recordedBoosts[0].percentages).to.eql([33.34, 33.33, 33.33]);
  });
});

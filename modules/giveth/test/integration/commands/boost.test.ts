import "../../setup";
import { beforeAll, beforeEach, describe, it } from "bun:test";
import { type Action, BindingsSpace, isWalletAction } from "@evmcrispr/sdk";
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
  describeName:
    "Giveth > commands > boost <projects> [--with <percentages>] [--by <changes>]",
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
    {
      name: "fails when --with and --by are combined",
      script:
        "giveth:boost [evmcrispr wayback-machine] --with [50 50] --by [1 -1]",
      error: "--with and --by cannot be combined",
    },
    {
      name: "fails when --by length does not match the projects",
      script: "giveth:boost [evmcrispr wayback-machine] --by [20]",
      error: "--by length (1) does not match <projects> length (2)",
    },
    {
      name: "fails on zero --by changes",
      script: "giveth:boost [evmcrispr wayback-machine] --by [0 0]",
      error: "--by changes must be non-zero numbers between -100 and 100",
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

  const runBoost = async (script: string, client?: WalletClient) => {
    const wallet = client ?? walletClient;
    const account = wallet.account!;
    const evm = new Interpreter(evml.registry, {
      account: account.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

    const actionCallback = async (action: Action) => {
      if (isWalletAction(action) && action.method === "personal_sign") {
        return wallet.signMessage({
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

  it("simulates inside sim:fork without signing in or updating Giveth", async () => {
    const account = walletClient.account!;
    const evm = new Interpreter(evml.registry, {
      account: account.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

    // No outer actionCallback: sim:fork supplies its own fork executor.
    await evm.interpret(`load giveth
load sim
sim:fork --using anvil (
  giveth:boost [evmcrispr wayback-machine] --with [70 30]
)`);

    expect(recordedLogins).to.have.length(0);
    expect(recordedBoosts).to.have.length(0);
  }, 30000);

  const boostsOf = (evm: Interpreter, name: string) => {
    const [slugs, percentages] = evm.getBinding(name, BindingsSpace.USER) as [
      string[],
      { toNumber(): number }[],
    ];
    return [slugs, percentages.map((p) => p.toNumber())];
  };

  it("applies simulated boosts to later reads inside the same sim:fork only", async () => {
    const evm = new Interpreter(evml.registry, {
      account: walletClient.account!.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

    await evm.interpret(`load giveth
load sim
sim:fork --using anvil (
  giveth:boost [evmcrispr wayback-machine] --with [40 60]
  set $inside @giveth:boostedBy()
  giveth:boost [evmcrispr] --by [10]
  set $merged @giveth:boostedBy()
)
set $after @giveth:boostedBy()`);

    expect(boostsOf(evm, "$inside")).to.eql([
      ["wayback-machine", "evmcrispr"],
      [60, 40],
    ]);
    // --by merges against the simulated allocation, not the live one.
    expect(boostsOf(evm, "$merged")).to.eql([
      ["evmcrispr", "wayback-machine"],
      [50, 50],
    ]);
    // Outside the fork the live allocation (fixture: 70/30) is back.
    expect(boostsOf(evm, "$after")).to.eql([
      ["evmcrispr", "wayback-machine"],
      [70, 30],
    ]);
    expect(recordedBoosts).to.have.length(0);
  }, 30000);

  it("records simulated boosts for accounts Giveth does not know yet", async () => {
    const stranger = getWalletClients()[3];
    const evm = new Interpreter(evml.registry, {
      account: stranger.account!.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

    await evm.interpret(`load giveth
load sim
sim:fork --using anvil (
  giveth:boost [evmcrispr] --with [100]
  set $inside @giveth:boostedBy()
)
set $after @giveth:boostedBy()`);

    expect(boostsOf(evm, "$inside")).to.eql([["evmcrispr"], [100]]);
    expect(boostsOf(evm, "$after")).to.eql([[], []]);
  }, 30000);

  // Existing allocation fixture (user 25): wayback-machine 30, evmcrispr 70.
  it("shifts GIVpower between projects with --by", async () => {
    await runBoost("giveth:boost [evmcrispr wayback-machine] --by [20 -20]");
    expect(recordedBoosts).to.eql([
      { projectIds: [2000, 1350], percentages: [10, 90], authVersion: "2" },
    ]);
  });

  it("drops projects decremented to zero", async () => {
    await runBoost("giveth:boost [evmcrispr wayback-machine] --by [30 -30]");
    expect(recordedBoosts).to.eql([
      { projectIds: [1350], percentages: [100], authVersion: "2" },
    ]);
  });

  it("adds unboosted projects funded by decrements, keeping the rest", async () => {
    await runBoost(
      "giveth:boost [the-giveth-community-of-makers evmcrispr] --by [20 -20]",
    );
    expect(recordedBoosts).to.eql([
      {
        projectIds: [2000, 1350, 1],
        percentages: [30, 50, 20],
        authVersion: "2",
      },
    ]);
  });

  it("shrinks the other boosted projects proportionally on a net increase", async () => {
    await runBoost("giveth:boost [the-giveth-community-of-makers] --by [20]");
    expect(recordedBoosts).to.eql([
      {
        projectIds: [2000, 1350, 1],
        percentages: [24, 56, 20],
        authVersion: "2",
      },
    ]);
  });

  it("grows the other boosted projects proportionally on a net decrease", async () => {
    await runBoost("giveth:boost [wayback-machine] --by [-10]");
    expect(recordedBoosts).to.eql([
      { projectIds: [2000, 1350], percentages: [20, 80], authVersion: "2" },
    ]);
  });

  it("fails when the net increase exceeds what the other projects have", async () => {
    const error = await runBoost(
      "giveth:boost [the-giveth-community-of-makers gnosis-only-project] --by [60 60]",
    ).then(
      () => null,
      (e: Error) => e.message,
    );
    expect(error).to.include(
      "the changes take 120% from the other boosted projects, which only have 100% boosted",
    );
    expect(recordedBoosts).to.have.length(0);
  });

  it("fails when all boosted projects are listed and the changes unbalance the total", async () => {
    const error = await runBoost(
      "giveth:boost [evmcrispr wayback-machine] --by [20 -10]",
    ).then(
      () => null,
      (e: Error) => e.message,
    );
    expect(error).to.include(
      "the changes leave the allocation at 110%, not 100",
    );
    expect(recordedBoosts).to.have.length(0);
  });

  it("fails when decreasing a project by more than it has", async () => {
    const error = await runBoost(
      "giveth:boost [evmcrispr wayback-machine] --by [40 -40]",
    ).then(
      () => null,
      (e: Error) => e.message,
    );
    expect(error).to.include(
      "cannot decrease wayback-machine by 40: it only has 30% boosted",
    );
    expect(recordedBoosts).to.have.length(0);
  });

  it("fails --by decreases for accounts with no existing boosts", async () => {
    const error = await runBoost(
      "giveth:boost [evmcrispr wayback-machine] --by [20 -20]",
      getWalletClients()[1],
    ).then(
      () => null,
      (e: Error) => e.message,
    );
    expect(error).to.include(
      "cannot decrease wayback-machine by 20: it only has 0% boosted",
    );
  });

  it("starts a fresh allocation with --by when the changes sum to 100", async () => {
    await runBoost(
      "giveth:boost [evmcrispr wayback-machine] --by [60 40]",
      getWalletClients()[1],
    );
    expect(recordedBoosts).to.eql([
      { projectIds: [1350, 2000], percentages: [60, 40], authVersion: "2" },
    ]);
  });
});

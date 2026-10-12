import "../../setup";
import { describe, it } from "bun:test";
import { BindingsSpace } from "@evmcrispr/sdk";
import {
  expect,
  getPublicClient,
  getTransports,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import {
  createInterpreter,
  describeCommand,
  evml,
} from "@evmcrispr/test-utils/evml";
import { gnosis } from "viem/chains";
import { getForkBlockNumber } from "../../../../../scripts/anvil-config";

const OTHER_ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
// The in-process backends fork from anvil, which only serves its own block.
const BLOCK = await getForkBlockNumber();
const FORK = `--using ethereumjs --block-number ${BLOCK}`;
const wxdaiOf = (who: string) =>
  `@get(${WXDAI} "balanceOf(address)(uint256)" ${who})`;

describeCommand("fork", {
  describeName: "Sim > commands > fork (...) [--using <backend>]",
  module: "sim",
  preamble: "load sim",
  cases: [
    {
      name: "--as is @me inside the fork, and the script's account is back after it",
      timeout: 120000,
      script: `sim:fork ${FORK} --as ${OTHER_ACCOUNT} (
  set $inside @me
)
set $after @me`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$inside", BindingsSpace.USER)).to.eq(
          OTHER_ACCOUNT,
        );
        expect(interpreter.getBinding("$after", BindingsSpace.USER)).to.eq(
          TEST_ACCOUNT_ADDRESS,
        );
      },
    },
    {
      name: "deprecated --from still does what --as does",
      timeout: 120000,
      script: `sim:fork ${FORK} --from ${OTHER_ACCOUNT} (
  set $inside @me
)
set $after @me`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$inside", BindingsSpace.USER)).to.eq(
          OTHER_ACCOUNT,
        );
        expect(interpreter.getBinding("$after", BindingsSpace.USER)).to.eq(
          TEST_ACCOUNT_ADDRESS,
        );
      },
    },
    {
      name: "--as sends the block's transactions from that account",
      timeout: 120000,
      script: `sim:fork ${FORK} --as ${OTHER_ACCOUNT} (
  sim:set-balance ${OTHER_ACCOUNT} 50e18
  exec ${WXDAI} "deposit()" --value 1e18
  sim:expect @bool(${wxdaiOf(OTHER_ACCOUNT)} == 1e18)
)`,
    },
    {
      name: "switch --as ( … ) inside a fork impersonates for the block only",
      timeout: 120000,
      script: `set $inside 0
set $back 0
sim:fork ${FORK} (
  sim:set-balance ${OTHER_ACCOUNT} 50e18
  switch --as ${OTHER_ACCOUNT} (
    set $inside @me
    exec ${WXDAI} "deposit()" --value 1e18
  )
  set $back @me
  sim:expect @bool(${wxdaiOf(OTHER_ACCOUNT)} == 1e18)
)`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$inside", BindingsSpace.USER)).to.eq(
          OTHER_ACCOUNT,
        );
        expect(interpreter.getBinding("$back", BindingsSpace.USER)).to.eq(
          TEST_ACCOUNT_ADDRESS,
        );
      },
    },
    {
      name: "a bare switch --as inside a fork holds until the fork ends",
      timeout: 120000,
      script: `set $inside 0
sim:fork ${FORK} (
  sim:set-balance ${OTHER_ACCOUNT} 50e18
  switch --as ${OTHER_ACCOUNT}
  exec ${WXDAI} "deposit()" --value 1e18
  set $inside @me
  sim:expect @bool(${wxdaiOf(OTHER_ACCOUNT)} == 1e18)
)
set $after @me`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$inside", BindingsSpace.USER)).to.eq(
          OTHER_ACCOUNT,
        );
        expect(interpreter.getBinding("$after", BindingsSpace.USER)).to.eq(
          TEST_ACCOUNT_ADDRESS,
        );
      },
    },
    {
      name: "a bare switch --as inside an if in a fork ends with the if",
      timeout: 120000,
      script: `set $inside 0
set $back 0
sim:fork ${FORK} (
  if true (
    switch --as ${OTHER_ACCOUNT}
    set $inside @me
  )
  set $back @me
)`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$inside", BindingsSpace.USER)).to.eq(
          OTHER_ACCOUNT,
        );
        expect(interpreter.getBinding("$back", BindingsSpace.USER)).to.eq(
          TEST_ACCOUNT_ADDRESS,
        );
      },
    },
    {
      name: "a failing block inside switch --as leaves the fork's account in place",
      timeout: 120000,
      script: `set $failed 0
set $back 0
sim:fork ${FORK} (
  switch --as ${OTHER_ACCOUNT} (
    exec ${WXDAI} "transfer(address,uint256)" ${WXDAI} 999e18 -?!> $failed
  )
  set $back @me
)`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$failed", BindingsSpace.USER)).to.eq(
          "true",
        );
        expect(interpreter.getBinding("$back", BindingsSpace.USER)).to.eq(
          TEST_ACCOUNT_ADDRESS,
        );
      },
    },
  ],
  docCases: [
    {
      description: "Fork and set account balance",
      code: `sim:fork --using anvil (\n  sim:set-balance @me 100e18\n)`,
    },
    {
      description: "Run the block as another account",
      timeout: 120000,
      // Literal: generated docs take this text as written.
      code: `sim:fork --as 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (\n  sim:set-balance @me 100e18\n)`,
    },
  ],
  errorCases: [
    {
      name: "should refuse --as together with --from",
      script: `sim:fork ${FORK} --as ${OTHER_ACCOUNT} --from ${OTHER_ACCOUNT} (
  print "inside"
)`,
      error: "--as and --from name the same thing",
    },
    {
      name: "should fail with an invalid --auth-token format",
      script: `sim:fork --auth-token badformat (
  print "inside"
)`,
      error: "Invalid --auth-token option",
    },
    {
      name: "should fail with an unknown --using backend",
      script: `sim:fork --using unknown-backend (
  print "inside"
)`,
      error:
        "--using must be one of anvil, hardhat, tenderly, tenderly-multichain, ethereumjs, revm, got unknown-backend",
    },
  ],
});

describe("Sim > commands > fork --on", () => {
  it("forks the named chain and puts the script's chain back", async () => {
    // The script is on mainnet; the fork is of gnosis, where WXDAI lives.
    const interpreter = createInterpreter(
      `load sim
switch mainnet
set $name 0
sim:fork ${FORK} --on gnosis (
  set $name @get(${WXDAI} "name()(string)")
  exec ${WXDAI} "approve(address,uint256)" ${OTHER_ACCOUNT} 1
)`,
      getPublicClient(),
    );
    const chains: (number | undefined)[] = [];
    interpreter.evm.registerActionObserver((action) => {
      chains.push((action as { chainId?: number }).chainId);
    });
    await interpreter.interpret();
    expect(interpreter.getBinding("$name", BindingsSpace.USER)).to.eq(
      "Wrapped XDAI",
    );
    expect(chains).to.eql([100]);
    expect(await interpreter.evm.getChainId()).to.eq(1);
  }, 120000);
});

describe("Sim > simulate({ from })", () => {
  const tag = evml.with({
    account: TEST_ACCOUNT_ADDRESS,
    chainId: gnosis.id,
    transports: getTransports(),
  });

  it("runs the script as that account, top-level switches included", async () => {
    const result = await tag
      .script(
        `switch gnosis
print @me
sim:set-balance @me 50e18
exec ${WXDAI} "deposit()" --value 1e18
sim:expect @bool(${wxdaiOf(OTHER_ACCOUNT)} == 1e18)`,
      )
      .simulate({
        using: "ethereumjs",
        from: OTHER_ACCOUNT,
        blockNumber: BLOCK,
      });
    expect(result.error).to.eq(undefined);
    expect(result.success).to.eq(true);
    expect(result.logs.join("\n")).to.include(OTHER_ACCOUNT);
  }, 120000);

  it("moves with each top-level bare switch of the script, as before", async () => {
    const result = await tag
      .script(
        `switch gnosis
exec ${WXDAI} "approve(address,uint256)" ${OTHER_ACCOUNT} 1
switch mainnet
exec ${OTHER_ACCOUNT} "ping()"
switch gnosis
exec ${WXDAI} "approve(address,uint256)" ${OTHER_ACCOUNT} 2`,
      )
      .simulate({ using: "ethereumjs", from: OTHER_ACCOUNT });
    expect(result.error).to.eq(undefined);
    expect(
      result.actions
        .filter((action) => "data" in action)
        .map((action) => (action as { chainId?: number }).chainId),
    ).to.eql([100, 1, 100]);
  }, 120000);

  it("starts the fork on the chain and as the account the script opens with", async () => {
    // The interpreter is on gnosis and nobody passes \`from\`: the script
    // alone says where it runs and as whom.
    const result = await tag
      .script(
        `switch mainnet --as ${OTHER_ACCOUNT}
print @me
exec ${OTHER_ACCOUNT} "ping()"`,
      )
      .simulate({ using: "ethereumjs" });
    expect(result.error).to.eq(undefined);
    expect(result.logs.join("\n")).to.include(OTHER_ACCOUNT);
    expect(
      result.actions
        .filter((action) => "data" in action)
        .map((action) => (action as { chainId?: number }).chainId),
    ).to.eql([1]);
  }, 120000);
});

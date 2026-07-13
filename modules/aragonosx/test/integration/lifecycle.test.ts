import "../setup";
import { afterAll, describe, it } from "bun:test";
import {
  expect,
  getTransports,
  resetAnvil,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import { mainnet } from "viem/chains";

/**
 * End-to-end story against the REAL OSx contracts on a mainnet fork:
 * create a DAO with the admin plugin, connect to it (served from the
 * new-dao cache), and route a grant through an admin proposal that
 * executes immediately. Every action executes on the fork, so a revert
 * anywhere fails the test.
 *
 * Runs against DRPC upstreams, so it needs a VITE_DRPC_API_KEY.
 */
describe("Aragonosx > lifecycle (mainnet fork)", () => {
  // The anvil network swap re-forks the shared node; restore the pinned
  // gnosis fork for whatever test file runs next.
  afterAll(async () => {
    await resetAnvil();
  });

  it("creates a DAO, connects and executes an admin proposal", async () => {
    const evm = new Interpreter(evml.registry, {
      account: TEST_ACCOUNT_ADDRESS,
      transports: getTransports(),
    });
    evm.switchChainId(mainnet.id);

    await evm.interpret(`load sim
load aragonosx
sim:fork --using anvil (
  aragonosx:new-dao $dao admin @me [0x0000000000000000000000000000000000000000 0]
  aragonosx:connect $dao (
    aragonosx:propose admin --metadata "created by evmcrispr" (
      aragonosx:grant @me dao EXECUTE
    )
  )
  sim:expect @get($dao "hasPermission(address,address,bytes32,bytes)(bool)" $dao @me @aragonosx:permission("EXECUTE") 0x)
)`);

    // Reaching this point means createDao, executeProposal and the granted
    // permission check all succeeded on the fork.
    expect(true).to.be.true;
  }, 180_000);

  it("installs the multisig plugin through the real PSP", async () => {
    const evm = new Interpreter(evml.registry, {
      account: TEST_ACCOUNT_ADDRESS,
      transports: getTransports(),
    });
    evm.switchChainId(mainnet.id);

    // Multisig setup params: members, (onlyListed, minApprovals),
    // TargetConfig(target, operation), metadata — encoded against the
    // build metadata fetched from IPFS.
    await evm.interpret(`load sim
load aragonosx
sim:fork --using anvil (
  aragonosx:new-dao $dao admin @me [0x0000000000000000000000000000000000000000 0]
  aragonosx:connect $dao (
    aragonosx:propose admin (
      aragonosx:install $ms multisig [@me] [true 1] [0x0000000000000000000000000000000000000000 0] 0x00
    )
  )
  sim:expect @get($dao "hasPermission(address,address,bytes32,bytes)(bool)" $dao $ms @aragonosx:permission("EXECUTE") 0x)
)`);

    // The multisig plugin was deployed, applied and holds EXECUTE_PERMISSION.
    expect(true).to.be.true;
  }, 180_000);
});

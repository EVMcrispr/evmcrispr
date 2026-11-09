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
 * ENSv2 registration end to end on a mainnet fork: commit, wait, approve
 * USDC, reveal through the ETHRegistrar, then read the name back from the v2
 * ETHRegistry. The account is given USDC by writing its balance (USDC keeps
 * balances in the mapping at slot 9).
 *
 * Runs against DRPC upstreams, so it needs a VITE_DRPC_API_KEY.
 */

const NAME = "evmcrispr-register-e2e";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ETH_REGISTRY = "0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2";

describe("Ens > register (ENSv2, mainnet fork)", () => {
  // The anvil network swap re-forks the shared node; restore the pinned
  // gnosis fork for whatever test file runs next.
  afterAll(async () => {
    await resetAnvil();
  });

  it("commits, waits, pays in USDC and registers the name to its owner", async () => {
    const evm = new Interpreter(evml.registry, {
      account: TEST_ACCOUNT_ADDRESS,
      transports: getTransports(),
    });
    evm.switchChainId(mainnet.id);
    await evm.interpret(`load sim
load lang
load ens
load contracts
sim:fork --using anvil (
  sim:set-balance @me 1e18
  sim:set-storage-at ${USDC} @contracts:slot.mapping(9 @me) @abi.encode("uint256" 1000e6)
  sim:expect @ens:available(${NAME}.eth)
  ens:register ${NAME}.eth @me 1y --secret @hash("register fork test")
  set $id @num(@ens:labelhash("${NAME}"))
  set $owner @get(${ETH_REGISTRY} "getOwner(uint256)(address)" $id)
  sim:expect @bool(@lang:str.lower(@str($owner)) == @lang:str.lower(@str(@me)))
  sim:expect @bool(@get(${ETH_REGISTRY} "getExpiry(uint256)(uint64)" $id) > 0)
  sim:expect @bool(@get(${USDC} "balanceOf(address)(uint256)" @me) < 1000e6)
)`);
    // Reaching this point means the commit, the wait, the approval, the
    // reveal and every expectation on the fork succeeded.
    expect(true).to.be.true;
  }, 240_000);
});

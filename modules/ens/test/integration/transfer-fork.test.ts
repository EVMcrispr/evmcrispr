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
 * ENSv2 transfers end to end on a mainnet fork: register a fresh name with
 * the ETHRegistrar (paid in USDC, given to the account by writing its balance
 * at slot 9), transfer it, then transfer it back as the new owner. The way
 * back only works if the owner's roles moved with the registry token.
 *
 * Runs against DRPC upstreams, so it needs a VITE_DRPC_API_KEY.
 */

const NAME = "evmcrispr-transfer-e2e";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ETH_REGISTRY = "0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2";
// All-ones address: its EIP-55 checksum has no letters, so string equality
// against @get results is case-safe.
const NEW_OWNER = "0x1111111111111111111111111111111111111111";

describe("Ens > transfer (ENSv2, mainnet fork)", () => {
  // The anvil network swap re-forks the shared node; restore the pinned
  // gnosis fork for whatever test file runs next.
  afterAll(async () => {
    await resetAnvil();
  });

  it("hands the name and its roles over, and the new owner can hand it back", async () => {
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
  sim:set-balance ${NEW_OWNER} 1e18
  sim:set-storage-at ${USDC} @contracts:slot.mapping(9 @me) @abi.encode("uint256" 1000e6)
  ens:register ${NAME}.eth @me 1y --secret @hash("transfer fork test")
  set $id @num(@ens:labelhash("${NAME}"))
  sim:expect @bool(@lang:str.lower(@str(@get(${ETH_REGISTRY} "getOwner(uint256)(address)" $id))) == @lang:str.lower(@str(@me)))
  ens:transfer ${NAME}.eth to ${NEW_OWNER}
  sim:expect @bool(@str(@get(${ETH_REGISTRY} "getOwner(uint256)(address)" $id)) == @str(${NEW_OWNER}))
  switch --as ${NEW_OWNER} (
    ens:transfer ${NAME}.eth to ${TEST_ACCOUNT_ADDRESS}
  )
  sim:expect @bool(@lang:str.lower(@str(@get(${ETH_REGISTRY} "getOwner(uint256)(address)" $id))) == @lang:str.lower(@str(@me)))
)`);
    // Reaching this point means the registration, both transfers and every
    // ownership expectation succeeded on the fork.
    expect(true).to.be.true;
  }, 240_000);
});

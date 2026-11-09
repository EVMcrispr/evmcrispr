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
 * ENSv2 subnames end to end on a mainnet fork: register a .eth name with a
 * resolver of its own, create a subname (ens:create-subname deploys the
 * name's subregistry and attaches it, as the name has none), set its text
 * record and read it back through the Universal Resolver, then transfer it.
 * A fresh subregistry is not emancipated, so the transfer goes through
 * unsafeTransfer. The on-chain owner face reaches the subname through the
 * subregistry.
 *
 * Runs against DRPC upstreams, so it needs a VITE_DRPC_API_KEY.
 */

const NAME = "evmcrispr-subnames-e2e";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ETH_REGISTRY = "0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2";
// All-ones address: its EIP-55 checksum has no letters, so string equality
// against @get results is case-safe.
const NEW_OWNER = "0x1111111111111111111111111111111111111111";

describe("Ens > subnames (ENSv2, mainnet fork)", () => {
  // The anvil network swap re-forks the shared node; restore the pinned
  // gnosis fork for whatever test file runs next.
  afterAll(async () => {
    await resetAnvil();
  });

  it("creates a subname in a subregistry it attaches, sets its records and transfers it", async () => {
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
  ens:create-resolver $resolver --salt @hash("subnames fork test")
  ens:register ${NAME}.eth @me 1y --secret @hash("subnames fork test") --resolver $resolver
  sim:expect @bool(@get(${ETH_REGISTRY} "getSubregistry(string)(address)" "${NAME}") == 0x0000000000000000000000000000000000000000)
  ens:create-subname ${NAME}.eth vault @me
  sim:expect @bool(@get(${ETH_REGISTRY} "getSubregistry(string)(address)" "${NAME}") != 0x0000000000000000000000000000000000000000)
  sim:expect @bool(@lang:str.lower(@str(@ens:owner(vault.${NAME}.eth))) == @lang:str.lower(@str(@me)))
  sim:expect @bool(@ens:resolver(vault.${NAME}.eth) == $resolver)
  sim:expect @bool(@ens:expiry(vault.${NAME}.eth) > 0)
  ens:set-text vault.${NAME}.eth url "https://vault.example"
  sim:expect @bool(@ens:text(vault.${NAME}.eth url) == "https://vault.example")
  ens:transfer vault.${NAME}.eth to ${NEW_OWNER}
  sim:expect @bool(@str(@ens:owner(vault.${NAME}.eth)) == @str(${NEW_OWNER}))
  assert @ens:owner!(vault.${NAME}.eth) == ${NEW_OWNER}
)`);
    // Reaching this point means the registry deployment, the subname, its
    // record, the transfer and every expectation held on the fork.
    expect(true).to.be.true;
  }, 240_000);
});

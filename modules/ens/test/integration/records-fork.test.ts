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
 * ENSv2 records end to end on a mainnet fork: create a PermissionedResolver
 * through ENS's VerifiableFactory, register a name pointing at it, set its
 * text, address and content hash records, and read them back through the
 * Universal Resolver, as any client would. Then point the name at a second
 * resolver with ens:set-resolver and see its records follow.
 *
 * Runs against DRPC upstreams, so it needs a VITE_DRPC_API_KEY.
 */

const NAME = "evmcrispr-records-e2e";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ETH_REGISTRY = "0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2";
const CONTENT =
  "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

describe("Ens > records (ENSv2, mainnet fork)", () => {
  // The anvil network swap re-forks the shared node; restore the pinned
  // gnosis fork for whatever test file runs next.
  afterAll(async () => {
    await resetAnvil();
  });

  it("sets text, address and content hash on the name's own resolver, read back through the Universal Resolver", async () => {
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
  ens:create-resolver $resolver --salt @hash("records fork test")
  sim:expect @bool(@contracts:codeAt($resolver) != 0x00)
  ens:register ${NAME}.eth @me 1y --secret @hash("records fork test") --resolver $resolver
  sim:expect @bool(@get(${ETH_REGISTRY} "getResolver(string)(address)" "${NAME}") == $resolver)
  ens:set-text ${NAME}.eth url "https://evmcrispr.com"
  ens:set-addr ${NAME}.eth @me
  ens:set-contenthash ${NAME}.eth "${CONTENT}"
  sim:expect @bool(@ens:text(${NAME}.eth url) == "https://evmcrispr.com")
  sim:expect @bool(@lang:str.lower(@str(@ens:addr(${NAME}.eth))) == @lang:str.lower(@str(@me)))
  sim:expect @bool(@ens:contenthash.of(${NAME}.eth) == "${CONTENT}")
  ens:create-resolver $other --salt @hash("records fork test, other")
  ens:set-resolver ${NAME}.eth $other
  sim:expect @bool(@get(${ETH_REGISTRY} "getResolver(string)(address)" "${NAME}") == $other)
  ens:set-text ${NAME}.eth url "https://other.example"
  sim:expect @bool(@ens:text(${NAME}.eth url) == "https://other.example")
)`);
    // Reaching this point means every deployment, record write and read-back
    // succeeded on the fork.
    expect(true).to.be.true;
  }, 240_000);
});

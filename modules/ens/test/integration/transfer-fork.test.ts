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
 * End-to-end story for unwrapped .eth 2LD transfers on a mainnet fork:
 * register a fresh name (commit → warp → reveal), then check that
 * `transfer` hands over BOTH roles (Registry controller via reclaim +
 * registrant NFT), and that a self-transfer is a pure reclaim.
 *
 * Runs against DRPC upstreams, so it needs a VITE_DRPC_API_KEY.
 */

const NAME = "evmcrispr-transfer-e2e";
const REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const BASE_REGISTRAR = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85";
// All-ones address: its EIP-55 checksum has no letters, so string equality
// against @get results is case-safe.
const NEW_OWNER = "0x1111111111111111111111111111111111111111";

describe("Ens > transfer (mainnet fork)", () => {
  // The anvil network swap re-forks the shared node; restore the pinned
  // gnosis fork for whatever test file runs next.
  afterAll(async () => {
    await resetAnvil();
  });

  it("reclaims on self-transfer and hands over both roles on transfer", async () => {
    const evm = new Interpreter(evml.registry, {
      account: TEST_ACCOUNT_ADDRESS,
      transports: getTransports(),
    });
    evm.switchChainId(mainnet.id);

    await evm.interpret(`load sim
load lang
load ens
sim:fork --using anvil (
  sim:set-balance @me 100e18
  ens:register ${NAME}.eth @me 1y --secret @id("transfer fork test")
  set $node @ens:namehash("${NAME}.eth")
  set $tokenId @num(@ens:labelhash("${NAME}"))
  set $controller @get(${REGISTRY} "owner(bytes32)(address)" $node)
  sim:expect @bool(@lang:str.lower(@str($controller)) == @lang:str.lower(@str(@me)))

  # Break the controller role, then reclaim it with a self-transfer (the
  # registrant NFT must not need to move).
  exec ${REGISTRY} setOwner(bytes32,address) $node ${NEW_OWNER}
  set $controller @get(${REGISTRY} "owner(bytes32)(address)" $node)
  sim:expect @bool(@str($controller) == @str(${NEW_OWNER}))
  ens:transfer ${NAME}.eth to @me
  set $controller @get(${REGISTRY} "owner(bytes32)(address)" $node)
  set $registrant @get(${BASE_REGISTRAR} "ownerOf(uint256)(address)" $tokenId)
  sim:expect @bool(@lang:str.lower(@str($controller)) == @lang:str.lower(@str(@me)))
  sim:expect @bool(@lang:str.lower(@str($registrant)) == @lang:str.lower(@str(@me)))

  # A full transfer moves the controller AND the registrant NFT.
  ens:transfer ${NAME}.eth to ${NEW_OWNER}
  set $controller @get(${REGISTRY} "owner(bytes32)(address)" $node)
  set $registrant @get(${BASE_REGISTRAR} "ownerOf(uint256)(address)" $tokenId)
  sim:expect @bool(@str($controller) == @str(${NEW_OWNER}))
  sim:expect @bool(@str($registrant) == @str(${NEW_OWNER}))
)`);

    // Reaching this point means the registration, both transfers and every
    // ownership assertion succeeded on the fork.
    expect(true).to.be.true;
  }, 240_000);
});

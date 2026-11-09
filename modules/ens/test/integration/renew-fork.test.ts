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
 * ENSv2 renewals end to end on a mainnet fork. One ens:renew covers a name
 * still on ENS v1 (renewed by ETHRenewerV1) and a name registered on ENSv2
 * (renewed by the ETHRegistrar), paid in USDC; each expiry grows by exactly
 * the duration. Expiries are read before and after, never pinned.
 *
 * Runs against DRPC upstreams, so it needs a VITE_DRPC_API_KEY.
 */

const V1_LABEL = "vitalik";
const V2_LABEL = "evmcrispr-renew-e2e";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const BASE_REGISTRAR = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85";
const ETH_REGISTRY = "0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2";

describe("Ens > renew (ENSv2, mainnet fork)", () => {
  // The anvil network swap re-forks the shared node; restore the pinned
  // gnosis fork for whatever test file runs next.
  afterAll(async () => {
    await resetAnvil();
  });

  it("renews a v1 name and an ENSv2 name in one go, each by exactly the duration", async () => {
    const evm = new Interpreter(evml.registry, {
      account: TEST_ACCOUNT_ADDRESS,
      transports: getTransports(),
    });
    evm.switchChainId(mainnet.id);
    await evm.interpret(`load sim
load ens
load contracts
sim:fork --using anvil (
  sim:set-balance @me 1e18
  sim:set-storage-at ${USDC} @contracts:slot.mapping(9 @me) @abi.encode("uint256" 1000e6)
  ens:register ${V2_LABEL}.eth @me 1y --secret @hash("renew fork test")
  set $v1 @num(@ens:labelhash("${V1_LABEL}"))
  set $v2 @num(@ens:labelhash("${V2_LABEL}"))
  set $v1Before @get(${BASE_REGISTRAR} "nameExpires(uint256)(uint256)" $v1)
  set $v2Before @get(${ETH_REGISTRY} "getExpiry(uint256)(uint64)" $v2)
  set $usdcBefore @get(${USDC} "balanceOf(address)(uint256)" @me)
  ens:renew [${V1_LABEL}.eth ${V2_LABEL}] 1y
  sim:expect @bool(@get(${BASE_REGISTRAR} "nameExpires(uint256)(uint256)" $v1) == @num($v1Before + 31536000))
  sim:expect @bool(@get(${ETH_REGISTRY} "getExpiry(uint256)(uint64)" $v2) == @num($v2Before + 31536000))
  sim:expect @bool(@get(${USDC} "balanceOf(address)(uint256)" @me) < $usdcBefore)
)`);
    // Reaching this point means both renewals went through their renewer
    // and every expectation held on the fork.
    expect(true).to.be.true;
  }, 240_000);
});

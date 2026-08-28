import "../setup";
import { CORE_ADDRESS } from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import type { PublicClient } from "viem";
import { getAddress } from "viem";
import { eezBaseAbi } from "../../src/abis";
import { EEZ_CHAINS } from "../../src/constants";
import { devnet, L1_ID, L2_ID, l1, l2 } from "../devnet";

const DEAD = "0x000000000000000000000000000000000000dEaD";

/**
 * The on-chain helper runtime (Assertions core + Operators) is deployed at
 * its canonical addresses on both EEZ chains; a real `assert` compiled by
 * std runs through it there.
 */
async function proxyFor(client: PublicClient, chainId: number) {
  return client.readContract({
    address: EEZ_CHAINS[chainId].registry,
    abi: eezBaseAbi,
    functionName: "computeCrossChainProxyAddress",
    args: [DEAD, EEZ_CHAINS[chainId].peerRollupId],
  });
}

const PROXY_L1 = devnet ? await proxyFor(l1, L1_ID) : DEAD;
const PROXY_L2 = devnet ? await proxyFor(l2, L2_ID) : DEAD;

for (const [label, chainId, client, proxy] of [
  ["L1", L1_ID, l1, PROXY_L1],
  ["L2", L2_ID, l2, PROXY_L2],
] as const) {
  const { registry, peerRollupId } = EEZ_CHAINS[chainId];
  const read = `${registry}::{computeCrossChainProxyAddress(address,uint64)(address) ${DEAD} ${peerRollupId}}`;

  describeCommand("assert", {
    describeName: `Eez > assertions runtime on EEZ Devnet ${label}`,
    chainId,
    skip: !devnet,
    cases: [
      {
        name: "a passing assertion executes through the deployed core",
        script: `assert ${read} == ${proxy}`,
        validate: async (actions) => {
          const [action] = actions as any[];
          expect(action.readOnly).to.equal(true);
          expect(getAddress(action.to)).to.equal(getAddress(CORE_ADDRESS));
          // An empty address would "succeed" too: make sure the core is there.
          const code = await client.getCode({ address: CORE_ADDRESS });
          expect(code && code !== "0x", "Assertions core not deployed").to.be
            .true;
          // A passing assertParam returns without reverting.
          await client.call({ to: action.to, data: action.data });
        },
      },
      {
        name: "a failing assertion reverts inside the deployed core",
        script: `assert ${read} == ${DEAD} "not the proxy"`,
        validate: async (actions) => {
          const [action] = actions as any[];
          let reverted = false;
          try {
            await client.call({ to: action.to, data: action.data });
          } catch {
            reverted = true;
          }
          expect(reverted).to.be.true;
        },
      },
    ],
  });
}

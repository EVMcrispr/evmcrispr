import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, isAddressEqual, parseAbi, toHex } from "viem";
import { eezBaseAbi } from "../../../src/abis";
import { EEZ_CHAINS } from "../../../src/constants";
import { devnet, ensureFunded, L1_ID, l1, l1Wallet } from "../../devnet";

const valueAbi = parseAbi(["function setValue(uint256 v)"]);
const { registry } = EEZ_CHAINS[L1_ID];
const fresh: `0x${string}` = `0x${toHex(BigInt(Date.now()) + 1n, { size: 20 }).slice(2)}`;
/** Stable target whose proxy the setup below makes sure exists. */
const KNOWN = "0x000000000000000000000000000000000000bEEF";

const proxyOf = (target: `0x${string}`) =>
  l1.readContract({
    address: registry,
    abi: eezBaseAbi,
    functionName: "computeCrossChainProxyAddress",
    args: [target, 1n],
  });

describeCommand("call", {
  module: "eez",
  preamble: "load eez",
  chainId: L1_ID,
  skip: !devnet,
  cases: [
    {
      name: "creates a missing proxy, then calls through it via the ingress",
      script: `eez:call ${fresh} setValue(uint256) 42`,
      validate: async (actions) => {
        expect(actions).to.have.lengthOf(2);
        const [create, call] = actions as any[];
        expect(isAddressEqual(create.to, registry)).to.be.true;
        expect(create.rpcUrl).to.be.undefined;
        expect(isAddressEqual(call.to, await proxyOf(fresh))).to.be.true;
        expect(call.rpcUrl).to.be.undefined;
        // Estimated for the caller: nothing at `fresh` on the rollup, so
        // the remote simulation is a plain call and the floor applies.
        expect(call.gas).to.be.a("bigint");
        expect(call.gas >= 300_000n).to.be.true;
        const decoded = decodeFunctionData({ abi: valueAbi, data: call.data });
        expect(decoded.args).to.eql([42n]);
      },
    },
    {
      name: "skips creation when the proxy already exists",
      script: `eez:call ${KNOWN} setValue(uint256) 7 --value 1 --gas 700000`,
      timeout: 120_000,
      setup: async () => {
        await ensureFunded();
        const proxy = await proxyOf(KNOWN);
        const code = await l1.getCode({ address: proxy });
        if (code && code !== "0x") return;
        const hash = await l1Wallet.writeContract({
          address: registry,
          abi: eezBaseAbi,
          functionName: "createCrossChainProxy",
          args: [KNOWN, 1n],
        });
        await l1.waitForTransactionReceipt({ hash, timeout: 60_000 });
      },
      validate: async (actions) => {
        expect(actions).to.have.lengthOf(1);
        const [call] = actions as any[];
        expect(isAddressEqual(call.to, await proxyOf(KNOWN))).to.be.true;
        expect(call.value).to.equal(1n);
        expect(call.gas).to.equal(700000n);
        expect(call.rpcUrl).to.be.undefined;
      },
    },
  ],
  errorCases: [
    {
      name: "refuses to call the current chain through a proxy",
      script: `eez:call ${KNOWN} setValue(uint256) 1 --chain 0`,
      error: "itself",
    },
  ],
  docCases: [
    {
      description:
        "From L1, set a value on a rollup contract in one atomic transaction",
      code: "switch eezL1\neez:call 0x000000000000000000000000000000000000bEEF setValue(uint256) 42",
    },
  ],
});

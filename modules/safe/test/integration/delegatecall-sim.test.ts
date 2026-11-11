import "../setup";
import { describe, expect, it } from "bun:test";
import { suggestionScript } from "@evmcrispr/sdk";
import {
  getPublicClient,
  getTransports,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { evml } from "@evmcrispr/test-utils/evml";
import { installAssertionsCore } from "@evmcrispr/test-utils/onchain";
import { encodeFunctionData, getAddress, parseAbi } from "viem";
import { gnosis } from "viem/chains";
import { SIGN_MESSAGE_LIB, safeDeployment } from "../../src/addresses";
import {
  multichainSafe,
  predictSafeAddress,
  SAFE_PROXY_CREATION_CODE,
} from "../../src/utils/deployment";

/**
 * A Safe's delegatecall, simulated the way the builder simulates a Safe's
 * block: as the Safe (`sim:fork --as $safe`), outside any safe:propose.
 * SignMessageLib writes `signedMessages` on the Safe's own storage, so the
 * mark is only there if the library really ran as the Safe.
 */
const OWNER = getAddress("0x00000000000000000000000000000000005afe11");
const SALT = 8211n;
const tag = evml.with({
  account: TEST_ACCOUNT_ADDRESS,
  chainId: gnosis.id,
  transports: getTransports(),
});
await installAssertionsCore(getPublicClient());

// The in-browser engine, and the chain's own node (eth_simulateV1).
for (const using of ["ethereumjs", "rpc"] as const)
  describe(`Safe > delegate-exec inside a simulation – ${using}`, () => {
    it("runs the library as the Safe and suggests what controls the Safe", async () => {
      const predicted = await deploySafe();
      const block = [
        "load safe",
        `safe:delegate-exec ${SIGN_MESSAGE_LIB} "signMessage(bytes)" 0x1234`,
        `sim:expect @bool(@get(${predicted} "signedMessages(bytes32)(uint256)" @get(${predicted} "getMessageHash(bytes)(bytes32)" 0x1234)) == 1)`,
      ].join("\n");
      const result = await tag.script(block).simulate({
        using,
        from: predicted,
        suggest: true,
        blockNumber: Number(await getPublicClient().getBlockNumber()),
      });
      expect(result.error).toBeUndefined();
      const lines = result
        .suggestions!.filter((s) => s.event === "simulatedDelegatecall")
        .map((s) => s.line);
      expect(lines).toContain("assert @safe:threshold!($executor) == 1");
      expect(lines).toContain(
        "assert @lang:len!(@safe:owners!($executor)) == 1",
      );
      expect(lines).toContain(
        "assert @safe:isOwner!($owner $executor) == true",
      );
      expect(lines).toContain("assert @safe:guard!($executor) == $none");
      expect(
        lines.some((l) =>
          l.startsWith("assert @safe:singleton!($executor) == $"),
        ),
      ).toBe(true);
      expect(
        lines.some((l) =>
          l.startsWith("assert @safe:fallbackHandler!($executor) == $"),
        ),
      ).toBe(true);

      // The suggestions hold when the block runs again with them in it.
      const checked = await tag
        .script(
          `${block}\n${suggestionScript(
            result.suggestions!.filter(
              (s) => s.event === "simulatedDelegatecall",
            ),
          )
            .split("\n")
            .filter((l) => l !== "load safe")
            .join("\n")}`,
        )
        .simulate({
          using,
          from: predicted,
          blockNumber: Number(await getPublicClient().getBlockNumber()),
        });
      expect(checked.error).toBeUndefined();
    }, 240000);
  });

/** A v1.5.0 Safe on the test node, deployed before the run: the run
 *  impersonates it from its first transaction, and CREATE2 refuses an
 *  address that has sent one. */
async function deploySafe() {
  const client = getPublicClient();
  const deployment = safeDeployment(gnosis.id);
  const { singleton, initializer } = multichainSafe(deployment, [OWNER], 1n);
  const address = predict();
  if ((await client.getCode({ address }))?.length) return address;
  await client.request({
    method: "anvil_impersonateAccount" as never,
    params: [TEST_ACCOUNT_ADDRESS] as never,
  });
  await client.request({
    method: "anvil_setBalance" as never,
    params: [TEST_ACCOUNT_ADDRESS, "0xde0b6b3a7640000"] as never,
  });
  const hash = (await client.request({
    method: "eth_sendTransaction" as never,
    params: [
      {
        from: TEST_ACCOUNT_ADDRESS,
        to: deployment.proxyFactory,
        data: encodeFunctionData({
          abi: parseAbi([
            "function createProxyWithNonce(address,bytes,uint256) returns (address)",
          ]),
          functionName: "createProxyWithNonce",
          args: [singleton, initializer, SALT],
        }),
      },
    ] as never,
  })) as `0x${string}`;
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("the Safe was not created");
  return address;
}

function predict() {
  const deployment = safeDeployment(gnosis.id);
  const { singleton, initializer } = multichainSafe(deployment, [OWNER], 1n);
  return predictSafeAddress(
    deployment,
    SAFE_PROXY_CREATION_CODE,
    initializer,
    SALT,
    singleton,
  );
}

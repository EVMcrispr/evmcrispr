import { describe, expect, it } from "bun:test";
import { createEvml, Interpreter } from "@evmcrispr/core";
import SafeProxy from "@safe-global/safe-smart-account/build/artifacts/contracts/proxies/SafeProxy.sol/SafeProxy.json";
import {
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  type Hex,
  parseAbi,
  zeroAddress,
} from "viem";
import Governor from "../../../governor/src";
import Safe from "../../src";
import { SENTINEL, safeDeployment } from "../../src/addresses";
import {
  SAFE_PROXY_CREATION_CODE,
  safeFactoryAbi,
  safeInitializer,
} from "../../src/utils/deployment";

const owner = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const tag = createEvml().use(Safe);

async function compile(script: string, chainId = 1) {
  const logs: string[] = [];
  const interpreter = new Interpreter(tag.registry, {
    chainId,
    account: owner,
    onLog: (message) => logs.push(message),
    transports: {
      [chainId]: custom({
        request: async () => {
          throw new Error("RPC forbidden");
        },
      }),
    },
  });
  const actions = await interpreter.interpret(`load safe\n${script}`);
  return { logs, actions };
}

describe("Safe address prediction", () => {
  it("pins the actual Safe 1.5.0 proxy creation code", () => {
    expect(SAFE_PROXY_CREATION_CODE).toBe(SafeProxy.bytecode as Hex);
  });

  it("matches safe:new with default, custom and uint256-max nonces without RPC", async () => {
    for (const chainId of [1, 10200]) {
      for (const nonce of [undefined, 42n, (1n << 256n) - 1n]) {
        const { logs, actions } = await compile(
          `print @safe:address(${owner}${nonce === undefined ? "" : ` ${nonce}`})
safe:new ${owner}${nonce === undefined ? "" : ` --salt ${nonce}`}`,
          chainId,
        );
        expect(logs[1]).toBe(`Deploying new Safe at ${logs[0]}`);
        const action = actions[0];
        if ("type" in action) throw new Error("expected deployment action");
        const deployment = safeDeployment(chainId);
        expect(action.to).toBe(deployment.proxyFactory);
        expect(
          decodeFunctionData({ abi: safeFactoryAbi, data: action.data! }).args,
        ).toEqual([
          deployment.l2Singleton,
          safeInitializer([owner], 1n, deployment.fallbackHandler),
          nonce ?? 0n,
        ]);
      }
    }
  });

  it("depends on owner, nonce and deployment profile, with a default nonce of 0", async () => {
    const script = `print @safe:address(${owner})
print @safe:address(${owner} 0)
print @safe:address(${owner} 42)
print @safe:address(${other} 42)`;
    const canonical = (await compile(script)).logs;
    expect(canonical[0]).toBe(canonical[1]);
    expect(new Set([canonical[0], canonical[2], canonical[3]]).size).toBe(3);
    expect((await compile(script, 100)).logs).toEqual(canonical);
    const eez = (await compile(script, 10200)).logs;
    expect(eez[2]).not.toBe(canonical[2]);
    expect((await compile(script, 6291)).logs).toEqual(eez);
  });

  it("predicts after collecting a deployment in a batch", async () => {
    const { actions, logs } = await compile(`batch (
  safe:new ${owner} --salt 42
  exec ${other} "setOwner(address)" @safe:address(${owner} 42)
)`);
    const batch = actions[0];
    if (!("type" in batch) || batch.type !== "batched")
      throw new Error("expected an ordinary batch");
    expect(batch.actions).toHaveLength(2);
    const predicted = logs[0].match(/0x[0-9a-fA-F]{40}/)![0];
    expect(batch.actions[1].data?.slice(-40).toLowerCase()).toBe(
      predicted.slice(2).toLowerCase(),
    );
  });

  it("rejects invalid deployment nonces instead of truncating them", async () => {
    for (const nonce of ["-1", "1.5", String(1n << 256n)]) {
      await expect(
        compile(`print @safe:address(${owner} ${nonce})`),
      ).rejects.toThrow("salt nonce");
      await expect(
        compile(`safe:new ${owner} --salt ${nonce}`),
      ).rejects.toThrow("salt nonce");
    }
  });

  it("rejects zero and sentinel owners", async () => {
    for (const invalid of [zeroAddress, SENTINEL])
      await expect(
        compile(`print @safe:address(${invalid} 42)`),
      ).rejects.toThrow("valid Safe owner");
  });

  it("can use the Governor's timelock via @sender in a proposal", async () => {
    const interpreter = new Interpreter(
      createEvml().use(Safe).use(Governor).registry,
      {
        chainId: 1,
        account: owner,
        transports: {
          1: custom({
            request: async ({ method, params }) => {
              if (method !== "eth_call")
                throw new Error(`Unexpected RPC ${method}`);
              const [{ data }] = params as [{ data: Hex }];
              expect(
                decodeFunctionData({
                  abi: parseAbi(["function timelock() view returns (address)"]),
                  data,
                }).functionName,
              ).toBe("timelock");
              return encodeAbiParameters([{ type: "address" }], [other]);
            },
          }),
        },
      },
    );
    const actions = await interpreter.interpret(`load safe
load governor
governor:propose ${owner} "Treasury lookup" (
  exec ${owner} "setOwner(address)" @safe:address(@sender 42)
)`);
    const proposal = actions[0];
    if ("type" in proposal) throw new Error("expected proposal transaction");
    const { args } = decodeFunctionData({
      abi: parseAbi(["function propose(address[],uint256[],bytes[],string)"]),
      data: proposal.data!,
    });
    const call = decodeFunctionData({
      abi: parseAbi(["function setOwner(address)"]),
      data: args[2][0],
    });
    expect(String(call.args[0])).toBe(
      (await compile(`print @safe:address(${other} 42)`)).logs[0],
    );
  });
});

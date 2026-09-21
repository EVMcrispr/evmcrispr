import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  type Action,
  isTransactionAction,
  isWalletAction,
} from "@evmcrispr/sdk";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import {
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  type Hex,
  parseAbi,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  exportSafeTransaction,
  importSafeTransaction,
} from "../../src/utils/offline";
import { safeAbi } from "../../src/utils/reads";
import { getSafeTxTypedData, hashSafeTx } from "../../src/utils/safeTx";

evml.use({ name: "safe", load: () => import("../../src/index") });
const safe = "0x1111111111111111111111111111111111111111";
const accounts = [1n, 2n, 3n].map((key) =>
  privateKeyToAccount(toHex(key, { size: 32 })),
);
const chainId = 31337; // No Safe service mapping: all commands must still work.
let threshold: bigint;
let nonce: bigint;
let version: string;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const transport = custom({
  async request({ method, params }) {
    if (method === "eth_chainId") return toHex(chainId);
    if (method !== "eth_call") throw new Error(`Unexpected RPC ${method}`);
    const [{ data }] = params as [{ data: Hex }];
    const { functionName } = decodeFunctionData({ abi: safeAbi, data });
    const result = {
      VERSION: version,
      approvedHashes: 0n,
      nonce,
      getThreshold: threshold,
      getOwners: accounts.slice(0, 2).map((a) => a.address),
    }[functionName as "VERSION"];
    if (result === undefined)
      throw new Error(`Unexpected call ${functionName}`);
    return encodeFunctionResult({ abi: safeAbi, functionName, result } as any);
  },
});

const run = async (script: string, signer = 0, wallet = true) => {
  const logs: string[] = [];
  const actions: Action[] = [];
  const interpreter = new Interpreter(evml.registry, {
    account: accounts[signer].address,
    transports: { [chainId]: transport },
    onLog: (message: string) => logs.push(message),
  });
  interpreter.switchChainId(chainId);
  await interpreter.interpret(
    `load safe\n${script}\n`,
    wallet
      ? async (action) => {
          actions.push(action);
          if (isWalletAction(action)) {
            const typed = JSON.parse(action.params[1] as string);
            return accounts[signer].signTypedData(typed);
          }
          return undefined;
        }
      : undefined,
  );
  return { logs, actions };
};
const exported = (result: { logs: string[] }) =>
  result.logs.find((line) => line.startsWith('{"chainId"'))!;
const block = `(\n  exec ${safe} changeThreshold(uint256) 1\n)`;
const prepare = async () =>
  exported(
    await run(
      `safe:propose ${safe} ${block} --no-api true --unsigned true`,
      0,
      false,
    ),
  );

describe("Safe > commands without the API", () => {
  beforeEach(() => {
    threshold = 2n;
    nonce = 7n;
    version = "1.4.1";
    fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("HTTP is forbidden in --no-api commands"),
    );
  });
  afterEach(() => {
    const calls = fetchSpy.mock.calls.length;
    fetchSpy.mockRestore();
    expect(calls).toBe(0);
  });

  it("prepares without wallet access, collects two signatures, verifies, and executes from a non-owner", async () => {
    const prepared = await prepare();
    expect(JSON.parse(prepared).tx.nonce).toBe("7");
    const first = exported(
      await run(
        `safe:propose ${safe} ${JSON.stringify(prepared)} --no-api true`,
      ),
    );
    const second = exported(
      await run(
        `safe:propose ${safe} ${JSON.stringify(first)} --no-api true`,
        1,
      ),
    );
    expect(JSON.parse(second).signatures).toHaveLength(2);
    const verified = await run(
      `safe:verify ${safe} ${JSON.stringify(second)} --no-api true --nested-safe ${safe}`,
      0,
      false,
    );
    expect(verified.logs.join("\n")).toContain("Nested Safe approveHash");
    const executed = await run(
      `safe:execute ${safe} ${JSON.stringify(second)} --no-api true`,
      2,
    );
    expect(executed.actions).toHaveLength(1);
    expect(isTransactionAction(executed.actions[0])).toBe(true);
  });

  it("signs blocks and executes with explicit signatures and nonce", async () => {
    const json = exported(
      await run(`safe:propose ${safe} ${block} --no-api true --nonce 7`),
    );
    const { tx, signatures } = importSafeTransaction(json, chainId, safe);
    signatures.push(
      await accounts[1].signTypedData(getSafeTxTypedData(chainId, safe, tx)),
    );
    const result = await run(
      `safe:execute ${safe} ${block} --no-api true --nonce 7 --signatures [${signatures.join(" ")}]`,
      2,
    );
    const action = result.actions[0];
    if (!isTransactionAction(action)) throw new Error("expected transaction");
    const decoded = decodeFunctionData({
      abi: parseAbi([
        "function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)",
      ]),
      data: action.data!,
    });
    expect(decoded.args[2]).toBe(tx.data);
    expect(decoded.args[9]).toHaveLength(2 + 130 * 2);
    const verified = await run(
      `safe:verify ${safe} ${block} --no-api true --nonce 7`,
      0,
      false,
    );
    expect(verified.logs.join("\n")).toContain(hashSafeTx(chainId, safe, tx));
  });

  it("still executes a threshold-one block without signatures or service access", async () => {
    threshold = 1n;
    expect(
      (await run(`safe:execute ${safe} ${block} --no-api true`)).actions,
    ).toHaveLength(1);
  });

  it("rejects bad combinations without falling back to the service", async () => {
    for (const [script, message] of [
      [`safe:propose ${safe} ${block} --unsigned true`, "require --no-api"],
      [`safe:propose ${safe} ${block} --no-api true --origin test`, "--origin"],
      [`safe:execute ${safe} ${block} --signatures []`, "require --no-api"],
      [
        `safe:execute ${safe} ${block} --no-api true --signatures []`,
        "requires --nonce",
      ],
      [
        `safe:execute ${safe} ${toHex(1n, { size: 32 })} --no-api true`,
        "without the service",
      ],
      [`safe:verify ${safe} 7 --no-api true`, "without the service"],
      [`safe:verify ${safe} ${block}`, "requires --no-api"],
      [
        `safe:propose ${safe} ${block} --no-api true --nonce 1.5`,
        "unsigned integer",
      ],
    ])
      await expect(run(script)).rejects.toThrow(message);
  });

  it("rejects insufficient signatures, a stale nonce, non-owners, and legacy Safes", async () => {
    const json = await prepare();
    await expect(
      run(`safe:execute ${safe} ${JSON.stringify(json)} --no-api true`),
    ).rejects.toThrow("0 of 2");
    await expect(
      run(`safe:propose ${safe} ${JSON.stringify(json)} --no-api true`, 2),
    ).rejects.toThrow("not an owner");
    nonce = 8n;
    await expect(
      run(`safe:execute ${safe} ${JSON.stringify(json)} --no-api true`),
    ).rejects.toThrow("current on-chain nonce 8");
    version = "1.2.0";
    await expect(prepare()).rejects.toThrow("only Safe >=1.3.0");
  });

  it("rejects changed transaction data and nonce overrides on imports", async () => {
    const json = await prepare();
    const data = JSON.parse(json);
    data.tx.data = "0x";
    await expect(
      run(
        `safe:verify ${safe} ${JSON.stringify(JSON.stringify(data))} --no-api true`,
      ),
    ).rejects.toThrow("safeTxHash mismatch");
    for (const command of ["propose", "execute", "verify"]) {
      await expect(
        run(
          `safe:${command} ${safe} ${JSON.stringify(json)} --no-api true --nonce 9`,
        ),
      ).rejects.toThrow("cannot override");
    }
    const imported = importSafeTransaction(json, chainId, safe);
    const otherChain = exportSafeTransaction(1, safe, imported.tx, []);
    await expect(
      run(`safe:propose ${safe} ${JSON.stringify(otherChain)} --no-api true`),
    ).rejects.toThrow("chainId");
  });
});

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  type Action,
  BindingsSpace,
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
import { parseSafeSignable, signingBytes } from "../../src/utils/signables";

evml.use({ name: "safe", load: () => import("../../src/index") });
evml.use({ name: "http", load: () => import("../../../http/src") });
const safe = "0x1111111111111111111111111111111111111111";
const accounts = [1n, 2n, 3n].map((key) =>
  privateKeyToAccount(toHex(key, { size: 32 })),
);
const chainId = 31337; // No Safe service mapping: all commands must still work.
let threshold: bigint;
let nonce: bigint;
let version: string;
let approvals: Set<string>;
let parentOwners: `0x${string}`[] | undefined;
/** Safes other than `safe`, by lowercase address: owner Safes of it. */
let ownerSafes: Map<
  string,
  { owners: `0x${string}`[]; threshold: bigint; nonce?: bigint }
>;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const transport = custom({
  async request({ method, params }) {
    if (method === "eth_chainId") return toHex(chainId);
    if (method === "eth_getStorageAt") return `0x${"0".repeat(64)}`;
    if (method === "eth_getCode") {
      const [address] = params as [string];
      return ownerSafes.has(address.toLowerCase()) ||
        address.toLowerCase() === safe
        ? "0x60"
        : "0x";
    }
    const [{ to, data }] = params as [{ to: string; data: Hex }];
    const other = ownerSafes.get(String(to).toLowerCase());
    if (method !== "eth_call") throw new Error(`Unexpected RPC ${method}`);
    const { functionName, args } = decodeFunctionData({ abi: safeAbi, data });
    const result = {
      VERSION: version,
      approvedHashes: approvals.has(String(args?.[0]).toLowerCase()) ? 1n : 0n,
      nonce: other ? (other.nonce ?? 0n) : nonce,
      getThreshold: other ? other.threshold : threshold,
      getOwners: other
        ? other.owners
        : (parentOwners ?? accounts.slice(0, 2).map((a) => a.address)),
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
    `load safe\nload http\n${script}\n`,
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
  const binding = (name: string) =>
    interpreter.getBinding(name, BindingsSpace.USER) as string;
  return { logs, actions, binding };
};
const execAbi = parseAbi([
  "function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)",
]);
const target = "0x3333333333333333333333333333333333333333";
const block = `(\n  exec ${target} ping()\n)`;
/** Flow 3, step 1: anyone prepares, no wallet. */
const prepare = async () =>
  (await run(`safe:propose-offline $tx ${safe} ${block}`, 0, false)).binding(
    "$tx",
  );
/** Flow 3, step 2: one owner adds a signature. */
const confirmOffline = async (json: string, signer: number) =>
  (
    await run(
      `safe:confirm-offline $out ${safe} ${JSON.stringify(json)}`,
      signer,
    )
  ).binding("$out");

describe("Safe > flows without the Safe Transaction Service", () => {
  beforeEach(() => {
    threshold = 2n;
    nonce = 7n;
    version = "1.4.1";
    approvals = new Set();
    ownerSafes = new Map();
    parentOwners = undefined;
    fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("HTTP is forbidden in local Safe commands"),
    );
  });
  afterEach(() => {
    const calls = fetchSpy.mock.calls.length;
    fetchSpy.mockRestore();
    expect(calls).toBe(0);
  });

  it("flow 1: executes a threshold-one block directly", async () => {
    threshold = 1n;
    expect((await run(`safe:execute ${safe} ${block}`)).actions).toHaveLength(
      1,
    );
  });

  it("sets the execTransaction gas limit with --gas", async () => {
    threshold = 1n;
    const [action] = (await run(`safe:execute ${safe} ${block} --gas 1500000`))
      .actions;
    if (!isTransactionAction(action)) throw new Error("expected transaction");
    expect(action.gas).toBe(1_500_000n);
  });

  it("flow 3: prepares without a wallet, owners confirm in turn, anyone executes", async () => {
    const prepared = await prepare();
    expect(JSON.parse(prepared).tx.nonce).toBe("7");
    const second = await confirmOffline(await confirmOffline(prepared, 0), 1);
    expect(JSON.parse(second).signatures).toHaveLength(2);
    const { binding } = await run(
      `set $report @safe:verify(${safe} ${JSON.stringify(second)})`,
      0,
      false,
    );
    const report = JSON.parse(binding("$report"));
    expect(report.readiness).toBe("ready");
    expect(report.competing).toEqual([]);
    const executed = await run(
      `safe:execute ${safe} ${JSON.stringify(second)}`,
      2,
    );
    expect(executed.actions).toHaveLength(1);
    expect(isTransactionAction(executed.actions[0])).toBe(true);
  });

  it("flow 3: merges signatures collected in parallel", async () => {
    const prepared = await prepare();
    const [a, b] = [
      await confirmOffline(prepared, 0),
      await confirmOffline(prepared, 1),
    ];
    const { binding } = await run(
      `set $tx @safe:merge(${JSON.stringify(a)} ${JSON.stringify(b)})`,
      0,
      false,
    );
    const merged = binding("$tx");
    expect(JSON.parse(merged).signatures).toHaveLength(2);
    const [action] = (
      await run(`safe:execute ${safe} ${JSON.stringify(merged)}`, 2)
    ).actions;
    if (!isTransactionAction(action)) throw new Error("expected transaction");
    expect(
      (decodeFunctionData({ abi: execAbi, data: action.data! }).args[9] as Hex)
        .length,
    ).toBe(2 + 130 * 2);
  });

  it("flow 4: confirms on-chain once per owner, then an owner executes", async () => {
    const prepared = await prepare();
    const tx = importSafeTransaction(prepared, chainId, safe).tx;
    const [action] = (
      await run(`safe:confirm-onchain ${safe} ${JSON.stringify(prepared)}`)
    ).actions;
    if (!isTransactionAction(action)) throw new Error("expected transaction");
    expect(action.to).toBe(safe);
    expect(
      decodeFunctionData({
        abi: parseAbi(["function approveHash(bytes32)"]),
        data: action.data!,
      }).args[0],
    ).toBe(hashSafeTx(chainId, safe, tx));

    approvals.add(accounts[0].address.toLowerCase());
    const again = await run(
      `safe:confirm-onchain ${safe} ${JSON.stringify(prepared)}`,
    );
    expect(again.actions).toHaveLength(0);
    expect(again.logs.join("\n")).toContain("already confirmed");
    await expect(
      run(`safe:confirm-onchain ${safe} ${JSON.stringify(prepared)}`, 2),
    ).rejects.toThrow("not an owner");

    // Owner 1 executes: its own approval plus owner 0's on-chain one.
    const [exec] = (
      await run(`safe:execute ${safe} ${JSON.stringify(prepared)}`, 1)
    ).actions;
    if (!isTransactionAction(exec)) throw new Error("expected transaction");
    expect(exec.from).toBe(accounts[1].address);
    const signatures = decodeFunctionData({ abi: execAbi, data: exec.data! })
      .args[9] as Hex;
    for (const owner of [accounts[0], accounts[1]])
      expect(signatures.toLowerCase()).toContain(
        `${owner.address.slice(2).toLowerCase()}${"0".repeat(64)}01`,
      );
    // A non-owner executor adds nothing to one approval.
    approvals.clear();
    approvals.add(accounts[1].address.toLowerCase());
    await expect(run(`safe:execute ${safe} ${block}`, 2)).rejects.toThrow(
      "1 of 2",
    );

    nonce = 8n;
    await expect(
      run(`safe:confirm-onchain ${safe} ${JSON.stringify(prepared)}`),
    ).rejects.toThrow("already consumed");
  });

  it("flow 6: an owner of an owner Safe confirms with the same commands", async () => {
    const ownerSafe = "0x4444444444444444444444444444444444444444";
    // `safe` is owned by owner Safe B and owner 1; B is owned by owner 2.
    parentOwners = [ownerSafe, accounts[1].address];
    ownerSafes.set(ownerSafe, {
      owners: [accounts[2].address],
      threshold: 1n,
      nonce: 5n,
    });
    const prepared = await prepare();
    const signed = JSON.parse(await confirmOffline(prepared, 2));
    const payload = signingBytes(parseSafeSignable(prepared));
    // Owner 2's signature sits under owner Safe B, over B's SafeMessage of
    // the parent's payload (Safe 1.4.1: the preimage).
    expect(signed.signatures).toEqual([
      {
        type: "contract",
        owner: ownerSafe,
        message: payload,
        signatures: [expect.stringMatching(/^0x[0-9a-f]{130}$/)],
      },
    ]);

    // On-chain through B: B executes approveHash, sent by owner 2.
    const [action] = (
      await run(`safe:confirm-onchain ${safe} ${JSON.stringify(prepared)}`, 2)
    ).actions;
    if (!isTransactionAction(action)) throw new Error("expected transaction");
    expect(action.to).toBe(ownerSafe);
    const exec = decodeFunctionData({ abi: execAbi, data: action.data! });
    expect(exec.args[0]).toBe(safe);
    expect(
      decodeFunctionData({
        abi: parseAbi(["function approveHash(bytes32)"]),
        data: exec.args[2] as Hex,
      }).args[0],
    ).toBe(JSON.parse(prepared).safeTxHash);
    expect(exec.args[9]).toBe(
      `0x000000000000000000000000${accounts[2].address.slice(2).toLowerCase()}${"0".repeat(64)}01`,
    );

    // A B that needs more signatures cannot confirm on-chain alone.
    ownerSafes.get(ownerSafe)!.threshold = 2n;
    await expect(
      run(`safe:confirm-onchain ${safe} ${JSON.stringify(prepared)}`, 2),
    ).rejects.toThrow("needs more signatures than yours");
    // …but its owners still collect signatures offline.
    expect(
      JSON.parse(await confirmOffline(prepared, 2)).signatures,
    ).toHaveLength(1);
  });

  it("flow 6: follows owner Safes up to three levels and asks --via when ambiguous", async () => {
    const [b, c, d] = [
      "0x4444444444444444444444444444444444444444",
      "0x5555555555555555555555555555555555555555",
      "0x6666666666666666666666666666666666666666",
    ] as const;
    // safe ← B ← C ← owner 2
    parentOwners = [b, accounts[1].address];
    ownerSafes.set(b, { owners: [c], threshold: 1n });
    ownerSafes.set(c, { owners: [accounts[2].address], threshold: 1n });
    const prepared = await prepare();
    const signed = JSON.parse(await confirmOffline(prepared, 2));
    expect(signed.signatures[0]).toMatchObject({
      type: "contract",
      owner: b,
      signatures: [{ type: "contract", owner: c }],
    });

    // Owner 2 also owns D, another owner Safe of `safe`: the shortest route
    // wins.
    parentOwners = [b, d, accounts[1].address];
    ownerSafes.set(d, { owners: [accounts[2].address], threshold: 1n });
    expect(
      JSON.parse(await confirmOffline(prepared, 2)).signatures[0],
    ).toMatchObject({ type: "contract", owner: d });
    // Two routes of the same length are ambiguous until --via picks one.
    const e = "0x7777777777777777777777777777777777777777";
    parentOwners = [d, e, accounts[1].address];
    ownerSafes.set(e, { owners: [accounts[2].address], threshold: 1n });
    await expect(confirmOffline(prepared, 2)).rejects.toThrow(
      "several owner Safes",
    );
    const viaE = JSON.parse(
      (
        await run(
          `safe:confirm-offline $out ${safe} ${JSON.stringify(prepared)} --via ${e}`,
          2,
        )
      ).binding("$out"),
    );
    expect(viaE.signatures[0]).toMatchObject({ type: "contract", owner: e });
    // Not an owner at any level.
    parentOwners = [accounts[1].address];
    await expect(confirmOffline(prepared, 2)).rejects.toThrow(
      "directly or through owner Safes",
    );
  });

  it("flow 7: owners sign a text message and read the dapp signature", async () => {
    const { binding } = await run(
      `safe:propose-offline $msg ${safe} "I agree to the terms"`,
      0,
      false,
    );
    const unsigned = binding("$msg");
    expect(JSON.parse(unsigned).content).toBe("I agree to the terms");
    const signed = await confirmOffline(await confirmOffline(unsigned, 0), 1);
    const signature = (
      await run(
        `set $sig @safe:signature(${safe} ${JSON.stringify(signed)})`,
        0,
        false,
      )
    ).binding("$sig");
    expect(signature).toHaveLength(2 + 130 * 2);
    await expect(
      run(`set $sig @safe:signature(${safe} ${JSON.stringify(unsigned)})`),
    ).rejects.toThrow("not ready");
    await expect(
      run(`safe:execute ${safe} ${JSON.stringify(signed)}`),
    ).rejects.toThrow("@safe:signature");
    // Owners can also confirm a message on-chain: approveHash of its hash.
    const [approve] = (
      await run(`safe:confirm-onchain ${safe} ${JSON.stringify(signed)}`)
    ).actions;
    if (!isTransactionAction(approve)) throw new Error("expected transaction");
    expect(
      decodeFunctionData({
        abi: parseAbi(["function approveHash(bytes32)"]),
        data: approve.data!,
      }).args[0],
    ).toBe(JSON.parse(signed).safeMessageHash);
  });

  it("flow 9: prepares a rejection at a pending nonce", async () => {
    const rejection = JSON.parse(
      (
        await run(`safe:propose-offline $r ${safe} cancel --nonce 7`, 0, false)
      ).binding("$r"),
    );
    expect(rejection.tx).toMatchObject({
      to: safe,
      value: "0",
      data: "0x",
      operation: 0,
      nonce: "7",
    });
    // Quoted, "cancel" is just a text message.
    expect(
      JSON.parse(
        (
          await run(`safe:propose-offline $m ${safe} "cancel"`, 0, false)
        ).binding("$m"),
      ).content,
    ).toBe("cancel");
    await expect(
      run(`safe:propose-offline $r ${safe} cancel`, 0, false),
    ).rejects.toThrow("cancel needs --nonce");
    await expect(
      run(`safe:propose-offline $r ${safe} cancel --nonce 6`, 0, false),
    ).rejects.toThrow("already consumed");
  });

  it("flow 10: reviews JSON with no network access at all", async () => {
    const prepared = await prepare();
    const report = JSON.parse(
      (
        await run(
          `set $r @safe:verify(${safe} ${JSON.stringify(prepared)} no-rpc:true)`,
          0,
          false,
        )
      ).binding("$r"),
    );
    expect(report.readiness).toBe("unchecked");
    expect(report.hashes.safeTxHash).toBe(JSON.parse(prepared).safeTxHash);
    // Each fact once: the typed data carries the transaction.
    expect(Object.keys(report)).not.toContain("safeTransaction");
    expect(report.typedData.message.nonce).toBe(JSON.parse(prepared).tx.nonce);
  });

  it("rejects config variables and non-variable output destinations", async () => {
    for (const dest of ["$safe:apiKey", "literal"])
      await expect(
        run(`safe:propose-offline ${dest} ${safe} ${block}`, 0, false),
      ).rejects.toThrow();
  });

  it("rejects arguments a command does not accept", async () => {
    const prepared = JSON.stringify(await prepare());
    const hash = toHex(1n, { size: 32 });
    for (const [script, message] of [
      [
        `safe:propose-offline $x ${safe} ${hash}`,
        "safe:propose-offline accepts",
      ],
      [
        `safe:propose-offline $x ${safe} ${prepared} --nonce 3`,
        "safe:propose-offline accepts",
      ],
      [`safe:confirm-offline $x ${safe} ${block}`, "must be one of"],
      [
        `safe:confirm-offline $x ${safe} ${prepared} --message true`,
        "--message only applies",
      ],
      [`safe:confirm-onchain ${safe} 7`, "safe:confirm-onchain accepts"],
      [`safe:execute ${safe} 7`, "safe:execute accepts"],
      [`safe:execute ${safe} "hello"`, "safe:execute accepts"],
      [
        `safe:propose ${safe} ${JSON.stringify(exportSafeTransaction(chainId, "0x4444444444444444444444444444444444444444", importSafeTransaction(JSON.parse(prepared), chainId, safe).tx, []))}`,
        "this JSON belongs to Safe",
      ],
      [`set $r @safe:verify(${safe} ${hash} no-rpc:true)`, "no-rpc:true needs"],
      [
        `safe:propose-offline $x ${safe} ${block} --nonce 1.5`,
        "unsigned integer",
      ],
      [`safe:propose-offline $x ${safe} '{"a":1}'`, "unrecognized JSON"],
    ])
      await expect(run(script)).rejects.toThrow(message);
  });

  it("refuses to sign or execute risky transactions unless the reviewed values are allowed", async () => {
    const newOwner = accounts[2].address;
    // Authored in the script, propose-offline only warns.
    const risky = JSON.parse(
      (
        await run(
          `safe:propose-offline $tx ${safe} (\n  exec ${safe} addOwnerWithThreshold(address,uint256) ${newOwner} 3\n  exec ${target} ping()\n)`,
          0,
          false,
        )
      ).binding("$tx"),
    );
    const json = JSON.stringify(JSON.stringify(risky));
    const needed = `--allow-new-owners ${newOwner} --allow-change-threshold-to 3`;
    // Reviewing someone else's transaction is gated.
    for (const command of [
      `safe:confirm-offline $out ${safe} ${json}`,
      `safe:confirm-onchain ${safe} ${json}`,
      `safe:execute ${safe} ${json}`,
      // Allowing other values than the transaction's is no allowance.
      `safe:confirm-offline $out ${safe} ${json} --allow-new-owners ${target} --allow-change-threshold-to 3`,
    ])
      await expect(run(command)).rejects.toThrow(
        `calls[0].calls[0]: adds owner ${newOwner}`,
      );
    await expect(
      run(`safe:confirm-offline $out ${safe} ${json}`),
    ).rejects.toThrow(`if intended, pass ${needed}`);
    const signed = await run(
      `safe:confirm-offline $out ${safe} ${json} --allow-new-owners [${newOwner}] --allow-change-threshold-to 3`,
    );
    expect(signed.logs.join("\n")).toContain(
      "ALLOWED (--allow-change-threshold-to)",
    );
    // The verification report reaches the same verdict.
    const report = JSON.parse(
      (await run(`set $r @safe:verify(${safe} ${json})`, 0, false)).binding(
        "$r",
      ),
    );
    expect(report.verdict).toBe("blocked");
    expect(report.requires).toEqual([
      `--allow-new-owners ${newOwner}`,
      "--allow-change-threshold-to 3",
    ]);
  });

  it("rejects insufficient signatures, a stale nonce, non-owners, and legacy Safes", async () => {
    const json = await prepare();
    await expect(
      run(`safe:execute ${safe} ${JSON.stringify(json)}`, 2),
    ).rejects.toThrow("0 of 2");
    await expect(confirmOffline(json, 2)).rejects.toThrow("not an owner");
    nonce = 8n;
    await expect(
      run(`safe:execute ${safe} ${JSON.stringify(json)}`),
    ).rejects.toThrow("current on-chain nonce 8");
    version = "1.2.0";
    await expect(prepare()).rejects.toThrow("only Safe >=1.3.0");
  });

  it("rejects changed transaction data and JSON from another chain", async () => {
    const json = await prepare();
    const data = JSON.parse(json);
    data.tx.data = "0x";
    await expect(
      run(
        `set $r @safe:verify(${safe} ${JSON.stringify(JSON.stringify(data))})`,
      ),
    ).rejects.toThrow("safeTxHash mismatch");
    const message = JSON.parse(
      (await run(`safe:propose-offline $m ${safe} "hi"`, 0, false)).binding(
        "$m",
      ),
    );
    message.content = "bye";
    await expect(confirmOffline(JSON.stringify(message), 0)).rejects.toThrow(
      "content does not hash",
    );
    const imported = importSafeTransaction(json, chainId, safe);
    const otherChain = exportSafeTransaction(1, safe, imported.tx, []);
    await expect(confirmOffline(otherChain, 0)).rejects.toThrow("chainId");
  });

  it("signs smart-free blocks exactly like the transaction owners verified", async () => {
    const json = await prepare();
    const { tx } = importSafeTransaction(json, chainId, safe);
    const sig = await accounts[1].signTypedData(
      getSafeTxTypedData(chainId, safe, tx),
    );
    const merged = (
      await run(`set $t @safe:merge(${JSON.stringify(json)} ${sig})`, 0, false)
    ).binding("$t");
    const [action] = (
      await run(`safe:execute ${safe} ${JSON.stringify(merged)}`)
    ).actions;
    if (!isTransactionAction(action)) throw new Error("expected transaction");
    expect(
      decodeFunctionData({ abi: execAbi, data: action.data! }).args[2],
    ).toBe(tx.data);
  });
});

// Live, opt-in (EVMCRISPR_HEGOTA=1): what the Hegota devnet does with POST_TX
// frames, measured before EVMcrispr relies on it (the spec's "Measured on
// Hegota"). It records, it does not judge: each probe logs its finding.
// Probe contracts are deployed once from anvil #0 (public key, devnet ETH);
// the questions are asked through the node's own simulation, except what a
// failing POST_TX frame does to a sent transaction, which needs one send.
import { describe, expect, it } from "bun:test";
import {
  arbitrarySignatureEntry,
  HEGOTA_DEVNET_RPC,
  ethrexHegotaDevnetProfile as profile,
  simulate,
  toFrameRequests,
} from "@evmcrispr/viem-frames";
import {
  encodeTx,
  newTx,
  secp256k1Placeholder,
  signTx,
} from "@forshtat/hegota-support/tx";
import {
  concat,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  getContractAddress,
  type Hex,
  http,
  pad,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { FrameSpec } from "../../src/frame-action";
import { frameTxGas } from "../../src/simulate/intrinsic";

const ENABLED = process.env.EVMCRISPR_HEGOTA === "1";
const KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const ENTRY_POINT = "0x00000000000000000000000000000000000000aa";

/** Init code returning `runtime`. */
const deployable = (runtime: Hex): Hex => {
  const size = (runtime.length - 2) / 2;
  return `0x60${size.toString(16).padStart(2, "0")}8060095f395ff3${runtime.slice(2)}`;
};
// Reverts unless TXTRACE(param = word 0, in2 = word 1) == word 2. On
// Hegota the index (in2) is the top operand and the parameter below it.
const TRACE_EXPECT: Hex = "0x5f35602035b6604035146010575f5ffd5b00";
// Reverts unless CALLER is the entry point 0x…aa.
const CALLER_IS_AA: Hex = "0x3360aa14600a575f5ffd5b00";
// Reverts unless TXTRACE(param = word 0, in2 = word 1) <= word 2.
const TRACE_LE: Hex = "0x5f35602035b660403510156011575f5ffd5b00";
// EVENTDATACOPY(eventIndex 0, memOffset 0x40, dataOffset 0, length 32), the
// first operand on top; reverts unless memory 0x40 then holds word 0. Any
// other operand order halts or copies elsewhere.
const EVENT_DATA_EXPECT: Hex = "0x60205f60405fb76040515f35146013575f5ffd5b00";
// SSTOREs word 0 at slot 0.
const WRITER: Hex = "0x5f355f5500";
const SALT = pad("0x8141790601");
const at = (runtime: Hex) =>
  getContractAddress({
    opcode: "CREATE2",
    from: DEPLOYER,
    salt: SALT,
    bytecode: deployable(runtime),
  });

const chain = defineChain({
  id: 3151908,
  name: "Hegota devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [HEGOTA_DEVNET_RPC] } },
});
const reader = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({
  account: privateKeyToAccount(KEY),
  chain,
  transport: http(),
});

async function deploy(runtime: Hex): Promise<Hex> {
  const address = at(runtime);
  if ((await reader.getCode({ address }))?.length) return address;
  const hash = await wallet.sendTransaction({
    to: DEPLOYER,
    data: concat([SALT, deployable(runtime)]),
    gas: 500_000n,
  });
  await reader.waitForTransactionReceipt({ hash });
  return address;
}

const verify: FrameSpec = {
  mode: "verify",
  approve: "both",
  target: null,
  data: "0x",
  value: 0n,
  gas: 30_000n,
};
const body = (f: Partial<FrameSpec>): FrameSpec => ({
  mode: "sender",
  target: DEAD,
  data: "0x",
  value: 0n,
  gas: 100_000n,
  stateGas: 200_000n,
  ...f,
});
const POST_TX = profile.frameModes.POST_TX!;

/** The frames, as the profile lays them out, with POST_TX frames appended. */
function frames(
  specs: FrameSpec[],
  post: { target: Hex; data: Hex; flags?: number }[],
) {
  return [
    ...toFrameRequests(specs, profile),
    ...post.map((p) => ({
      mode: POST_TX,
      flags: p.flags ?? 0,
      target: p.target,
      limits: { execution: 200_000n, state: 0n },
      value: 0n,
      data: p.data,
    })),
  ];
}

async function signed(all: ReturnType<typeof frames>): Promise<Hex> {
  const nonce = BigInt(
    await reader.getTransactionCount({ address: SENDER, blockTag: "pending" }),
  );
  const unsigned = newTx({
    chainId: chain.id,
    sender: SENDER,
    nonceSeq: nonce,
    frames: all as never,
    signatures: [secp256k1Placeholder(profile)],
    fees: { maxFeePerGas: 1_000n, maxPriorityFeePerGas: 1n },
  });
  return encodeTx(profile, await signTx(profile, unsigned, KEY));
}

type Sim = {
  valid?: boolean;
  executionStatus?: string;
  violation?: unknown;
  frames: { succeeded: boolean; gasUsed: Hex; stateGasUsed?: Hex }[];
};
async function ask(all: ReturnType<typeof frames>): Promise<Sim | string> {
  try {
    return (await simulate(HEGOTA_DEVNET_RPC, await signed(all))) as Sim;
  } catch (error) {
    return `refused: ${(error as Error).message.slice(0, 200)}`;
  }
}
const expectWord = (param: number, in2: bigint, value: bigint): Hex =>
  encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
    [BigInt(param), in2, value],
  );
/** Whether the last POST_TX frame (a TraceExpect query) succeeded. */
const holds = (s: Sim | string) =>
  typeof s === "string" ? s : (s.frames?.at(-1)?.succeeded ?? "no frames");

describe.skipIf(!ENABLED)("Hegota's POST_TX behaviour", () => {
  let expect_: Hex;
  let callerIs: Hex;
  let writer: Hex;

  it("deploys the probes", async () => {
    expect_ = await deploy(TRACE_EXPECT);
    callerIs = await deploy(CALLER_IS_AA);
    writer = await deploy(WRITER);
    console.log("probes", { expect_, callerIs, writer });
  }, 120_000);

  it("(d) caller and static", async () => {
    const caller = await ask(
      frames([verify, body({ value: 1n })], [{ target: callerIs, data: "0x" }]),
    );
    console.log(
      "(d) POST_TX called by the entry point:",
      holds(caller),
      ENTRY_POINT,
    );
    const write = await ask(
      frames(
        [verify, body({ value: 1n })],
        [{ target: writer, data: pad("0x01") }],
      ),
    );
    console.log(
      "(d) a POST_TX frame that writes storage succeeds:",
      holds(write),
    );
  }, 120_000);

  it("(c) the trace", async () => {
    const transfer = [verify, body({ value: 1n })];
    for (let n = 0n; n <= 6n; n++)
      if (
        holds(
          await ask(
            frames(transfer, [
              { target: expect_, data: expectWord(0x00, 0n, n) },
            ]),
          ),
        ) === true
      )
        console.log(`(c) BALANCE_COUNT after one transfer = ${n}`);
    for (let i = 0n; i < 4n; i++)
      for (const who of [
        DEAD,
        SENDER,
        ENTRY_POINT,
        `0x${"00".repeat(20)}`,
      ] as Hex[])
        if (
          holds(
            await ask(
              frames(transfer, [
                { target: expect_, data: expectWord(0x03, i, BigInt(who)) },
              ]),
            ),
          ) === true
        )
          console.log(`(c) BALANCE_ADDRESS[${i}] = ${who}`);
    for (let n = 0n; n <= 3n; n++)
      if (
        holds(
          await ask(
            frames(transfer, [
              { target: expect_, data: expectWord(0x0c, 0n, n) },
            ]),
          ),
        ) === true
      )
        console.log(
          `(c) EVENT_COUNT after one ETH transfer = ${n} (1 = the EIP-7708 log counts)`,
        );
    const twice = [
      verify,
      body({ target: writer, data: pad("0x01") }),
      body({ target: writer, data: pad("0x02") }),
    ];
    for (let n = 0n; n <= 3n; n++)
      if (
        holds(
          await ask(
            frames(twice, [{ target: expect_, data: expectWord(0x01, 0n, n) }]),
          ),
        ) === true
      )
        console.log(
          `(c) STORAGE_COUNT after one slot written twice = ${n} (1 = net)`,
        );
    const after = await ask(
      frames(twice, [{ target: expect_, data: expectWord(0x09, 0n, 2n) }]),
    );
    console.log(
      "(c) STORAGE_AFTER[0] is the last value written:",
      holds(after),
    );
    const outOfRange = await ask(
      frames(transfer, [{ target: expect_, data: expectWord(0x03, 99n, 0n) }]),
    );
    console.log(
      "(c) BALANCE_ADDRESS[99] (out of range):",
      JSON.stringify(outOfRange),
    );
    const revertedBody = [
      verify,
      body({ value: 1n, atomic: true }),
      body({ target: DEPLOYER, data: concat([pad("0x01"), "0x5f5ffd"]) }),
    ];
    for (let n = 0n; n <= 6n; n++)
      if (
        holds(
          await ask(
            frames(revertedBody, [
              { target: expect_, data: expectWord(0x00, 0n, n) },
            ]),
          ),
        ) === true
      )
        console.log(`(c) BALANCE_COUNT after a rolled-back transfer = ${n}`);
  }, 600_000);

  it("(b) the atomic flag around POST_TX frames", async () => {
    const before = await ask(
      frames(
        [verify, body({ value: 1n, atomic: true })],
        [{ target: callerIs, data: "0x" }],
      ),
    );
    console.log(
      "(b) atomic flag on the frame before a POST_TX frame:",
      JSON.stringify(before),
    );
    const on = await ask(
      frames(
        [verify, body({ value: 1n })],
        [
          { target: callerIs, data: "0x", flags: 0x4 },
          { target: callerIs, data: "0x" },
        ],
      ),
    );
    console.log("(b) atomic flag on a POST_TX frame:", JSON.stringify(on));
  }, 120_000);

  it("(a) a sent transaction whose POST_TX frame fails", async () => {
    const all = frames(
      [verify, body({ value: 7n })],
      [{ target: expect_, data: expectWord(0x00, 0n, 99n) }],
    );
    const sim = await ask(all);
    console.log("(a) the node's simulation of it:", JSON.stringify(sim));
    const dead = await reader.getBalance({ address: DEAD });
    const raw = await signed(all);
    let hash: string;
    try {
      hash = (await reader.request({
        method: "eth_sendRawTransaction",
        params: [raw],
      } as never)) as string;
    } catch (error) {
      console.log(
        "(a) refused at admission:",
        (error as Error).message.slice(0, 300),
      );
      return;
    }
    console.log("(a) admitted:", hash);
    for (let i = 0; i < 20; i++) {
      await Bun.sleep(3_000);
      const receipt = (await reader.request({
        method: "eth_getTransactionReceipt",
        params: [hash],
      } as never)) as { status: Hex; frameReceipts?: { status: Hex }[] } | null;
      const tx = await reader.request({
        method: "eth_getTransactionByHash",
        params: [hash],
      } as never);
      if (receipt) {
        console.log(
          "(a) mined:",
          JSON.stringify({
            status: receipt.status,
            frames: receipt.frameReceipts?.map((f) => f.status),
            deadReceived: String(
              (await reader.getBalance({ address: DEAD })) - dead,
            ),
          }),
        );
        return;
      }
      if (!tx) {
        console.log(
          `(a) dropped: no receipt, and the node no longer has it (after ${(i + 1) * 3} s)`,
        );
        return;
      }
    }
    console.log("(a) still pending after 60 s, no receipt");
  }, 180_000);

  it("(c) the parameter numbering: exact values where the demo's and the EIP's differ", async () => {
    const le = await deploy(TRACE_LE);
    const transfer = frames([verify, body({ value: 1n })], []);
    // The value of TXTRACE(param, in2) after one transfer, or "halts".
    const traced = async (param: number, in2: bigint) => {
      const at = (x: bigint) =>
        ask([
          ...transfer,
          ...frames([], [{ target: le, data: expectWord(param, in2, x) }]),
        ]).then(holds);
      if ((await at(2n ** 256n - 1n)) !== true) return "halts";
      let lo = 0n;
      let hi = 2n ** 256n - 1n;
      while (lo < hi) {
        const mid = (lo + hi) / 2n;
        if ((await at(mid)) === true) hi = mid;
        else lo = mid + 1n;
      }
      return `0x${lo.toString(16)}`;
    };
    for (const [param, in2] of [
      [0x00, 0n],
      [0x01, 0n],
      [0x02, 0n],
      [0x03, 0n],
      [0x03, 1n],
      [0x04, 0n],
      [0x04, 1n],
      [0x0c, 0n],
      [0x11, 0n],
      [0x13, 0n],
      [0x19, 0n],
      [0x1a, 0n],
    ] as const)
      console.log(
        `(c) TXTRACE(0x${param.toString(16)}, ${in2}) = ${await traced(param, in2)}`,
      );
    console.log(`(c) for reference: sender ${SENDER}, dead ${DEAD}`);
  }, 1_200_000);

  it("(c) EVENTDATACOPY's operand order", async () => {
    const probe = await deploy(EVENT_DATA_EXPECT);
    // The transfer's EIP-7708 log: data = the value, one word.
    const result = await ask(
      frames(
        [verify, body({ value: 9n })],
        [{ target: probe, data: pad("0x09") }],
      ),
    );
    console.log(
      "(c) EVENTDATACOPY with eventIndex on top, then memOffset, dataOffset, length:",
      holds(result),
    );
    // The control: a wrong expected word fails the same probe.
    const wrong = await ask(
      frames(
        [verify, body({ value: 9n })],
        [{ target: probe, data: pad("0x08") }],
      ),
    );
    console.log("(c) the same probe expecting the wrong word:", holds(wrong));
  }, 120_000);

  it("(e) the payer's balance as a POST_TX frame sees it: the gas pre-charge", async () => {
    const probe = await deploy(TRACE_EXPECT);
    const balance = await reader.getBalance({
      address: SENDER,
      blockTag: "pending",
    });
    const block = await reader.getBlock({ blockTag: "latest" });
    const baseFee = block.baseFeePerGas ?? 0n;
    // Whether TXTRACE(param, in2) == f(the transaction's own simulation),
    // iterated until the expected word, and so the calldata and the
    // transaction's maxCost, stop changing.
    const check = async (
      param: number,
      in2: bigint,
      f: (s: { maxCost: bigint; gasUsed: bigint }) => bigint,
    ) => {
      let value = 0n;
      for (let round = 0; round < 6; round++) {
        const sim = await ask(
          frames(
            [verify, body({ value: 1n })],
            [{ target: probe, data: expectWord(param, in2, value) }],
          ),
        );
        if (typeof sim === "string") return sim;
        const s2 = sim as Sim & { maxCost: string; gasUsed: string };
        const next = f({
          maxCost: BigInt(s2.maxCost),
          gasUsed: BigInt(s2.gasUsed),
        });
        if (next === value)
          return {
            holds: holds(sim),
            value: value.toString(),
            maxCost: s2.maxCost,
            gasUsed: s2.gasUsed,
          };
        value = next;
      }
      return "did not settle";
    };
    const out = {
      balance: balance.toString(),
      baseFee: baseFee.toString(),
      count: await check(0x00, 0n, () => 2n),
      senderIsEntry1: await check(0x03, 1n, () => BigInt(SENDER)),
      beforeIsBalance: await check(0x04, 1n, () => balance),
      afterMaxCost: await check(0x05, 1n, (s) => balance - 1n - s.maxCost),
      afterUsedAtMaxFee: await check(
        0x05,
        1n,
        (s) => balance - 1n - s.gasUsed * 1000n,
      ),
      afterUsedAtPrice: await check(
        0x05,
        1n,
        (s) => balance - 1n - s.gasUsed * (baseFee + 1n),
      ),
      afterNoCharge: await check(0x05, 1n, () => balance - 1n),
    };
    console.log("(e)", JSON.stringify(out, null, 1));
  }, 600_000);

  it("(f) the intrinsic gas in maxCost", async () => {
    // intrinsic = maxCost / maxFeePerGas - the frames' execution and state limits.
    const tokens = (data: Hex) => {
      let t = 0n;
      for (let i = 2; i < data.length; i += 2)
        t += data.slice(i, i + 2) === "00" ? 1n : 4n;
      return t;
    };
    const intrinsic = async (all: ReturnType<typeof frames>) => {
      const nonce = BigInt(
        await reader.getTransactionCount({
          address: SENDER,
          blockTag: "pending",
        }),
      );
      const tx = await signTx(
        profile,
        newTx({
          chainId: chain.id,
          sender: SENDER,
          nonceSeq: nonce,
          frames: all as never,
          signatures: [secp256k1Placeholder(profile)],
          fees: { maxFeePerGas: 1_000n, maxPriorityFeePerGas: 1n },
        }),
        KEY,
      );
      const raw = encodeTx(profile, tx);
      const sim = await simulate(HEGOTA_DEVNET_RPC, raw).catch((e: Error) =>
        e.message.slice(0, 100),
      );
      if (typeof sim === "string") return sim;
      const limits = all.reduce(
        (sum, f) =>
          sum +
          BigInt((f as { limits: { execution: bigint } }).limits.execution) +
          BigInt((f as { limits: { state: bigint } }).limits.state),
        0n,
      );
      const gas =
        BigInt((sim as unknown as { maxCost: string }).maxCost) / 1000n -
        limits;
      const sig = (tx as unknown as { signatures: Record<string, Hex>[] })
        .signatures[0]!;
      const model =
        12_000n +
        475n * BigInt(all.length) +
        all.reduce((t, f) => t + 4n * tokens(f.data as Hex), 0n) +
        2_800n +
        Object.entries(sig).reduce(
          (t, [k, v]) =>
            typeof v === "string" && v.startsWith("0x") && k !== "scheme"
              ? t + 4n * tokens(v)
              : t,
          0n,
        ) +
        6_000n *
          BigInt(
            all.filter(
              (f) =>
                BigInt(f.value as bigint) > 0n &&
                f.target &&
                f.target.toLowerCase() !== SENDER.toLowerCase(),
            ).length,
          );
      return `${gas} (model ${model}, diff ${gas - model}; signature fields ${Object.keys(sig).join(",")})`;
    };
    const zeros = (n: number) => `0x${"00".repeat(n)}` as Hex;
    const ones = (n: number) => `0x${"11".repeat(n)}` as Hex;
    const out: Record<string, string> = {};
    out["verify + body"] = await intrinsic(frames([verify, body({})], []));
    out["verify + 2 bodies"] = await intrinsic(
      frames([verify, body({}), body({})], []),
    );
    out["verify + 3 bodies"] = await intrinsic(
      frames([verify, body({}), body({}), body({})], []),
    );
    out["body value 1"] = await intrinsic(
      frames([verify, body({ value: 1n })], []),
    );
    for (const n of [1, 32, 64, 100])
      out[`body data ${n} zero bytes`] = await intrinsic(
        frames([verify, body({ data: zeros(n) })], []),
      );
    for (const n of [1, 32, 64, 100])
      out[`body data ${n} nonzero bytes`] = await intrinsic(
        frames([verify, body({ data: ones(n) })], []),
      );
    out["body + post-tx (no data)"] = await intrinsic(
      frames([verify, body({})], [{ target: DEAD, data: "0x" }]),
    );
    out["body + post-tx 32 nonzero"] = await intrinsic(
      frames([verify, body({})], [{ target: DEAD, data: ones(32) }]),
    );
    console.log("(f)", JSON.stringify(out, null, 1));
  }, 600_000);

  it("(g) the EIP-7708 transfer logs a POST_TX frame sees", async () => {
    const probe = await deploy(TRACE_EXPECT);
    const SYSTEM = "0xfffffffffffffffffffffffffffffffffffffffe";
    const TRANSFER =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const hex20 = (a: string) => a.slice(2).toLowerCase();
    // Reverts with any value.
    const reverter = await deploy("0x5f5ffd");
    // LOG0; CALL 0x…dEaD with 2 wei; CALL the reverter with 3 wei; STOP.
    const relay = await deploy(
      `0x5f5fa05f5f5f5f600273${hex20(DEAD)}5af1505f5f5f5f600373${hex20(reverter)}5af15000`,
    );
    // CREATE(value 4, empty init code); STOP.
    const creator = await deploy("0x5f5f6004f05000");
    // SELFDESTRUCT to 0x…dEaD.
    const destructor = await deploy(`0x73${hex20(DEAD)}ff`);
    const word = (a: string) => BigInt(a);
    /** Whether every TXTRACE(param, in2) == value, after `specs`. */
    const all = async (
      specs: FrameSpec[],
      checks: [number, bigint, bigint][],
    ) => {
      const out: string[] = [];
      for (const [param, in2, value] of checks) {
        const r = await ask(
          frames(specs, [
            { target: probe, data: expectWord(param, in2, value) },
          ]),
        );
        out.push(
          `TXTRACE(0x${param.toString(16)}, ${in2}) == 0x${value.toString(16)}: ${holds(r)}`,
        );
      }
      return out;
    };
    const created = getContractAddress({ from: creator, nonce: 1n });
    const result = {
      "A value to a codeless account": await all(
        [verify, body({ value: 7n })],
        [
          [0x0c, 0n, 1n],
          [0x0d, 0n, word(SYSTEM)],
          [0x0e, 0n, 3n],
          [0x0f, 0n, word(TRANSFER)],
          [0x10, 0n, word(SENDER)],
          [0x11, 0n, word(DEAD)],
          [0x13, 0n, 32n],
        ],
      ),
      "B value to a contract that logs, sends on, and makes a reverted call with value":
        await all(
          [verify, body({ target: relay, value: 10n })],
          [
            [0x0c, 0n, 3n],
            [0x0d, 0n, word(SYSTEM)],
            [0x10, 0n, word(SENDER)],
            [0x11, 0n, word(relay)],
            [0x0d, 1n, word(relay)],
            [0x0e, 1n, 0n],
            [0x0d, 2n, word(SYSTEM)],
            [0x10, 2n, word(relay)],
            [0x11, 2n, word(DEAD)],
          ],
        ),
      "C CREATE with value": await all(
        [verify, body({ target: creator, value: 10n })],
        [
          [0x0c, 0n, 2n],
          [0x0d, 1n, word(SYSTEM)],
          [0x10, 1n, word(creator)],
          [0x11, 1n, word(created)],
        ],
      ),
      "D SELFDESTRUCT to another account": await all(
        [verify, body({ target: destructor, value: 5n })],
        [
          [0x0c, 0n, 2n],
          [0x0d, 1n, word(SYSTEM)],
          [0x10, 1n, word(destructor)],
          [0x11, 1n, word(DEAD)],
        ],
      ),
      "E no value": await all([verify, body({})], [[0x0c, 0n, 0n]]),
    };
    console.log("(g)", JSON.stringify(result, null, 1));
  }, 900_000);

  it("(h) the intrinsic gas of a transaction signed with an ARBITRARY entry (a frame account's)", async () => {
    // A sender with code: the probe contract stands in for an account.
    // maxCost is fixed by the transaction alone, before any frame runs.
    const account = await deploy(TRACE_EXPECT);
    const nonce = BigInt(
      await reader.getTransactionCount({
        address: account,
        blockTag: "pending",
      }),
    );
    const accountVerify: FrameSpec = { ...verify };
    const run = async (signature: Hex) => {
      const all = toFrameRequests([accountVerify, body({})], profile);
      const tx = newTx({
        chainId: chain.id,
        sender: account,
        nonceSeq: nonce,
        frames: all as never,
        signatures: [arbitrarySignatureEntry(signature, profile)],
        fees: { maxFeePerGas: 1_000n, maxPriorityFeePerGas: 1n },
      });
      const sim = await simulate(
        HEGOTA_DEVNET_RPC,
        encodeTx(profile, tx),
      ).catch((e: Error) => e.message.slice(0, 160));
      if (typeof sim === "string") return sim;
      const limits = all.reduce(
        (sum, f) =>
          sum +
          BigInt((f as { limits: { execution: bigint } }).limits.execution) +
          BigInt((f as { limits: { state: bigint } }).limits.state),
        0n,
      );
      const maxCost = (sim as unknown as { maxCost?: string }).maxCost;
      return maxCost === undefined
        ? JSON.stringify(sim).slice(0, 200)
        : (BigInt(maxCost) / 1000n - limits).toString();
    };
    const result = {
      "65 zero bytes": await run(`0x${"00".repeat(65)}`),
      "65 nonzero bytes": await run(`0x${"11".repeat(65)}`),
      "65 bytes, one zero": await run(`0x00${"11".repeat(64)}`),
      "97 nonzero bytes": await run(`0x${"11".repeat(97)}`),
      "no bytes": await run("0x"),
    };
    console.log("(h)", JSON.stringify(result, null, 1));
  }, 600_000);

  it("(i) the simulator's intrinsic gas is the chain's, for a plain sender and a frame account", async () => {
    const account = await deploy(TRACE_EXPECT);
    const ones = (n: number) => `0x${"11".repeat(n)}` as Hex;
    const layouts: FrameSpec[][] = [
      [verify, body({})],
      [verify, body({ value: 3n }), body({ data: ones(40) })],
      [verify, body({ data: `0x00${"22".repeat(9)}` }), body({})],
    ];
    for (const specs of layouts)
      for (const [scheme, sender] of [
        ["secp256k1", SENDER],
        ["arbitrary", account],
      ] as const) {
        const all = toFrameRequests(specs, profile);
        // A signature with no zero byte: the case the simulator prices.
        const signature = ones(65);
        const tx = newTx({
          chainId: chain.id,
          sender,
          nonceSeq: 0n,
          frames: all as never,
          signatures: [
            scheme === "arbitrary"
              ? arbitrarySignatureEntry(signature, profile)
              : { ...secp256k1Placeholder(profile), signature },
          ],
          fees: { maxFeePerGas: 1_000n, maxPriorityFeePerGas: 1n },
        });
        const sim = (await simulate(
          HEGOTA_DEVNET_RPC,
          encodeTx(profile, tx),
        )) as unknown as { maxCost: string };
        const limits = all.reduce(
          (sum, f) =>
            sum +
            BigInt((f as { limits: { execution: bigint } }).limits.execution) +
            BigInt((f as { limits: { state: bigint } }).limits.state),
          0n,
        );
        expect(BigInt(sim.maxCost) / 1000n - limits).toBe(
          frameTxGas(
            all.map((f) => ({
              target: (f as { target: Hex | null }).target,
              data: (f as { data: Hex }).data,
              value: BigInt((f as { value: bigint }).value),
            })),
            sender,
            0n,
            scheme,
          ).intrinsic,
        );
      }
  }, 600_000);

  it("(j) the gas a transaction uses: intrinsic and frames, or the calldata floor", async () => {
    const ones = (n: number) => `0x${"11".repeat(n)}` as Hex;
    const zeros = (n: number) => `0x${"00".repeat(n)}` as Hex;
    const target = await deploy(WRITER); // SSTOREs word 0: uses gas
    const layouts: FrameSpec[][] = [
      [verify, body({})],
      [verify, body({ value: 3n })],
      [verify, body({ data: ones(100) })],
      [verify, body({ data: zeros(100) })],
      [verify, body({ data: ones(400) })],
      [verify, body({ target, data: pad("0x05") })],
    ];
    for (const specs of layouts) {
      const all = toFrameRequests(specs, profile);
      const nonce = BigInt(
        await reader.getTransactionCount({
          address: SENDER,
          blockTag: "pending",
        }),
      );
      const tx = await signTx(
        profile,
        newTx({
          chainId: chain.id,
          sender: SENDER,
          nonceSeq: nonce,
          frames: all as never,
          signatures: [secp256k1Placeholder(profile)],
          fees: { maxFeePerGas: 1_000n, maxPriorityFeePerGas: 1n },
        }),
        KEY,
      );
      const sim = (await simulate(
        HEGOTA_DEVNET_RPC,
        encodeTx(profile, tx),
      )) as unknown as {
        gasUsed: Hex;
        frames: { gasUsed: Hex; stateGasUsed: Hex }[];
      };
      const signature = (tx as unknown as { signatures: { signature: Hex }[] })
        .signatures[0]!.signature;
      const zeroBytes = BigInt(
        signature
          .slice(2)
          .match(/../g)!
          .filter((b) => b === "00").length,
      );
      const gas = frameTxGas(
        all.map((f) => ({
          target: (f as { target: Hex | null }).target,
          data: (f as { data: Hex }).data,
          value: BigInt((f as { value: bigint }).value),
        })),
        SENDER,
        nonce,
        "secp256k1",
      );
      // The real signature's zero bytes cost 12 less each in the intrinsic
      // gas; the floor prices every byte alike.
      const intrinsic = gas.intrinsic - 12n * zeroBytes;
      const execution = sim.frames.reduce((t, f) => t + BigInt(f.gasUsed), 0n);
      const state = sim.frames.reduce((t, f) => t + BigInt(f.stateGasUsed), 0n);
      const standard = intrinsic + execution + state;
      const floor = gas.floor + state;
      expect(BigInt(sim.gasUsed)).toBe(standard > floor ? standard : floor);
    }
  }, 600_000);

  it("(k) maxCost is the larger of the limits and the calldata floor", async () => {
    const ones = (n: number) => `0x${"11".repeat(n)}` as Hex;
    const out: Record<string, unknown> = {};
    for (const [name, specs] of [
      [
        "2 KB, gas 60000",
        [verify, body({ data: ones(2048), gas: 60_000n, stateGas: 0n })],
      ],
      [
        "2 KB, gas 60000, state 50000",
        [verify, body({ data: ones(2048), gas: 60_000n, stateGas: 50_000n })],
      ],
    ] as [string, FrameSpec[]][]) {
      const all = toFrameRequests(specs, profile);
      const tx = await signTx(
        profile,
        newTx({
          chainId: chain.id,
          sender: SENDER,
          nonceSeq: BigInt(
            await reader.getTransactionCount({
              address: SENDER,
              blockTag: "pending",
            }),
          ),
          frames: all as never,
          signatures: [secp256k1Placeholder(profile)],
          fees: { maxFeePerGas: 1_000n, maxPriorityFeePerGas: 1n },
        }),
        KEY,
      );
      const sim = await simulate(
        HEGOTA_DEVNET_RPC,
        encodeTx(profile, tx),
      ).catch((e: Error) => `refused: ${e.message.slice(0, 200)}`);
      const signature = (tx as unknown as { signatures: { signature: Hex }[] })
        .signatures[0]!.signature;
      const zeroBytes = BigInt(
        signature
          .slice(2)
          .match(/../g)!
          .filter((b) => b === "00").length,
      );
      const gas = frameTxGas(
        all.map((f) => ({
          target: (f as { target: Hex | null }).target,
          data: (f as { data: Hex }).data,
          value: BigInt((f as { value: bigint }).value),
        })),
        SENDER,
        (tx as unknown as { nonceSeq: bigint }).nonceSeq,
        "secp256k1",
      );
      const exec = all.reduce(
        (t, f) =>
          t + BigInt((f as { limits: { execution: bigint } }).limits.execution),
        0n,
      );
      const state = all.reduce(
        (t, f) => t + BigInt((f as { limits: { state: bigint } }).limits.state),
        0n,
      );
      // The most gas it can use: the limits or the floor (without the state
      // limits, in this revision), the larger.
      const standard = gas.intrinsic - 12n * zeroBytes + exec + state;
      expect(typeof sim).not.toBe("string");
      expect(BigInt((sim as unknown as { maxCost: Hex }).maxCost) / 1000n).toBe(
        standard > gas.floor ? standard : gas.floor,
      );
      out[name] = "ok";
    }
    console.log("(k)", JSON.stringify(out, null, 1));
  }, 600_000);

  it("(l) state gas (EIP-8037) and execution gas per frame", async () => {
    // CALL(gas, word 0, value 1); STOP.
    const sender1 = await deploy("0x5f5f5f5f60015f355af15000");
    // CALLDATACOPY the calldata, CREATE it with no value; STOP.
    const creator = await deploy("0x365f5f37365f5ff05000");
    const fresh = (n: number) =>
      `0x${(0x5eed0000 + n + Math.floor(Math.random() * 1e6)).toString(16).padStart(40, "0")}` as Hex;
    const word = (n: bigint) => pad(`0x${n.toString(16)}` as Hex);
    const writer = await deploy(WRITER);
    // 10 bytes of runtime code, deployed by init code.
    const tenBytes = deployable("0x00000000000000000000");
    const cases: [string, FrameSpec[]][] = [
      [
        "SSTORE new slot",
        [
          verify,
          body({
            target: writer,
            data: word(5n),
            gas: 100_000n,
            stateGas: 200_000n,
          }),
        ],
      ],
      [
        "new slot, then overwrite (2nd frame)",
        [
          verify,
          body({
            target: writer,
            data: word(5n),
            gas: 100_000n,
            stateGas: 200_000n,
          }),
          body({
            target: writer,
            data: word(6n),
            gas: 100_000n,
            stateGas: 200_000n,
          }),
        ],
      ],
      [
        "new slot, then cleared (2nd frame)",
        [
          verify,
          body({
            target: writer,
            data: word(5n),
            gas: 100_000n,
            stateGas: 200_000n,
          }),
          body({
            target: writer,
            data: word(0n),
            gas: 100_000n,
            stateGas: 200_000n,
          }),
        ],
      ],
      [
        "SSTORE new slot, state budget 1 short",
        [
          verify,
          body({
            target: writer,
            data: word(5n),
            gas: 100_000n,
            stateGas: 97_919n,
          }),
        ],
      ],
      [
        "CALL value 1 to a new account",
        [
          verify,
          body({
            target: sender1,
            data: pad(fresh(1)),
            value: 1n,
            gas: 100_000n,
            stateGas: 300_000n,
          }),
        ],
      ],
      [
        "frame value 1 to a new account",
        [
          verify,
          body({
            target: fresh(2),
            value: 1n,
            gas: 100_000n,
            stateGas: 300_000n,
          }),
        ],
      ],
      [
        "CREATE 10 bytes of code",
        [
          verify,
          body({
            target: creator,
            data: tenBytes,
            gas: 200_000n,
            stateGas: 400_000n,
          }),
        ],
      ],
      [
        "empty call to the writer (no write)",
        [
          verify,
          body({ target: writer, data: "0x", gas: 100_000n, stateGas: 0n }),
        ],
      ],
    ];
    const out: Record<string, unknown> = {};
    for (const [name, specs] of cases) {
      const sim = (await ask(frames(specs, []))) as Sim & {
        frames: { gasUsed: Hex; stateGasUsed: Hex; succeeded: boolean }[];
        gasUsed: Hex;
      };
      out[name] =
        typeof sim === "string"
          ? sim
          : {
              valid: sim.valid,
              frames: sim.frames.map(
                (f) =>
                  `${f.succeeded ? "ok" : "FAILED"} exec ${BigInt(f.gasUsed)} state ${BigInt(f.stateGasUsed ?? "0x0")}`,
              ),
              gasUsed: BigInt(sim.gasUsed).toString(),
            };
    }
    console.log("(l)", JSON.stringify(out, null, 1));
  }, 900_000);

  it("(m) SELFDESTRUCT to itself: the logs (EIP-7708's Burn?)", async () => {
    const probe = await deploy(TRACE_EXPECT);
    const destructSelf = await deploy("0x30ff");
    // CALLDATACOPY; CREATE(value 4, calldata); STOP.
    const creator4 = await deploy("0x365f5f37365f6004f05000");
    const BURN =
      "0xcc16f5dbb4873280815c1ee09dbd06736cffcc184412cf7a71a0fdb75d397ca5";
    const check = async (
      specs: FrameSpec[],
      checks: [string, number, bigint, bigint][],
    ) => {
      const out: string[] = [];
      for (const [label, param, in2, value] of checks) {
        const r = await ask(
          frames(specs, [
            { target: probe, data: expectWord(param, in2, value) },
          ]),
        );
        out.push(`${label}: ${holds(r)}`);
      }
      return out;
    };
    const result = {
      "A: an existing contract with 5 wei destructs to itself": await check(
        [verify, body({ target: destructSelf, value: 5n })],
        [
          ["1 event", 0x0c, 0n, 1n],
          ["2 events", 0x0c, 0n, 2n],
          ["event 1 is a Burn", 0x0f, 1n, BigInt(BURN)],
        ],
      ),
      "B: a contract created with 4 wei destructs to itself in its init code":
        await check(
          [verify, body({ target: creator4, data: "0x30ff", value: 10n })],
          [
            ["2 events", 0x0c, 0n, 2n],
            ["3 events", 0x0c, 0n, 3n],
            ["event 2 is a Burn", 0x0f, 2n, BigInt(BURN)],
          ],
        ),
    };
    console.log("(m)", JSON.stringify(result, null, 1));
  }, 600_000);
});

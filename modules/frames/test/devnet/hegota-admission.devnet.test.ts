// Live, opt-in (EVMCRISPR_HEGOTA=1): mempool admission parity of the
// in-process frame simulation with the Hegota devnet's own
// (`ethrex_simulateFrameTransaction`, which runs the checks its mempool runs
// on a send). For every case, the fork refuses the transaction exactly when
// the node calls it invalid: the prefix shapes and budgets, and the trace
// rules in a sponsor's pay frame (the sender's own verify frame is
// impersonated in the fork, so its trace is never checked there).
//
// The pay programs are deployed once through the CREATE2 deployer and funded
// from anvil's public key #0 (the owner agreed to test sends from it); the
// transactions compared are only simulated.
import { describe, expect, it } from "bun:test";
import {
  HEGOTA_DEVNET_RPC,
  hegotaDevnet,
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
  getContractAddress,
  type Hex,
  http,
  pad,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createEthereumJSBackend } from "../../../sim/src/lib/ethereumjs-backend";
import { createRevmBackend } from "../../../sim/src/lib/revm-backend";
import { frameAction } from "../../src/actions";
import type { FrameSpec } from "../../src/frame-action";

const ENABLED = process.env.EVMCRISPR_HEGOTA === "1";
const KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
/** Anvil's key #1: delegated (EIP-7702) by hegota-gas.devnet.test.ts. */
const DELEGATED = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const SALT = pad("0x8141790603");
const FEES = { maxFeePerGas: 1_000n, maxPriorityFeePerGas: 1n };

const chain = defineChain({
  id: hegotaDevnet.id,
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

/** Init code returning `runtime`. */
const deployable = (runtime: Hex): Hex => {
  const size = (runtime.length - 2) / 2;
  return `0x60${size.toString(16).padStart(2, "0")}8060095f395ff3${runtime.slice(2)}`;
};
/** Deployed and funded (to pay a transaction's maximum cost). */
async function deploy(runtime: Hex): Promise<Hex> {
  const address = getContractAddress({
    opcode: "CREATE2",
    from: DEPLOYER,
    salt: SALT,
    bytecode: deployable(runtime),
  });
  if (!(await reader.getCode({ address }))?.length) {
    const hash = await wallet.sendTransaction({
      to: DEPLOYER,
      data: concat([SALT, deployable(runtime)]),
      gas: 500_000n,
    });
    await reader.waitForTransactionReceipt({ hash });
  }
  if ((await reader.getBalance({ address })) < 10n ** 14n) {
    const hash = await wallet.sendTransaction({
      to: address,
      value: 10n ** 14n,
    });
    await reader.waitForTransactionReceipt({ hash });
  }
  return address;
}

// Pay programs: stop unless the entry point calls (so a plain transfer
// funds them), run the code under test, then APPROVE(PAYMENT).
const GUARD = "3360aa14600857005b";
const APPROVE_PAY = "60015f5faa";
const push20 = (a: string) => `73${a.slice(2).toLowerCase()}`;
const MISSING = "0x5eed00000000000000000000000000000000beef";
const PAY: Record<string, string> = {
  "nothing else": "",
  "SLOAD of its own storage": "5f5450",
  TIMESTAMP: "4250",
  NUMBER: "4350",
  CHAINID: "4650",
  BALANCE: "303150",
  SELFBALANCE: "4750",
  TLOAD: "5f5c50",
  ORIGIN: "3250",
  COINBASE: "4150",
  "GAS, then POP": "5a50",
  "GAS right before a STATICCALL to a precompile": "5f5f5f5f60045afa50",
  "a STATICCALL to an account that does not exist": `5f5f5f5f${push20(MISSING)}5afa50`,
  "a STATICCALL to an existing contract": `5f5f5f5f${push20(DEPLOYER)}5afa50`,
  "a STATICCALL to an account delegated by EIP-7702": `5f5f5f5f${push20(DELEGATED)}5afa50`,
  "EXTCODESIZE of an account that does not exist": `${push20(MISSING)}3b50`,
  "EXTCODEHASH of the sender": `${push20(SENDER)}3f50`,
  "SSTORE (a static frame: it reverts)": "60015f55",
};

const verify = (approve: FrameSpec["approve"], gas = 30_000n): FrameSpec => ({
  mode: "verify",
  approve,
  target: null,
  data: "0x",
  value: 0n,
  gas,
});
const body: FrameSpec = {
  mode: "sender",
  target: DEAD,
  data: "0x",
  value: 0n,
  gas: 50_000n,
  stateGas: 0n,
};
const payFrame = (target: Hex): FrameSpec => ({
  mode: "verify",
  approve: "payment",
  target,
  data: "0x",
  value: 0n,
  gas: 30_000n,
});

describe.skipIf(!ENABLED)(
  "mempool admission parity with the Hegota devnet",
  () => {
    const sponsors: Record<string, Hex> = {};
    it("deploys and funds the pay programs", async () => {
      for (const [name, code] of Object.entries(PAY))
        sponsors[name] = await deploy(`0x${GUARD}${code}${APPROVE_PAY}`);
    }, 900_000);

    const cases: [string, () => FrameSpec[]][] = [
      ["a self-verify frame", () => [verify("both"), body]],
      ["a prefix at MAX_VERIFY_GAS", () => [verify("both", 497_200n), body]],
      [
        "a prefix 1 gas over MAX_VERIFY_GAS",
        () => [verify("both", 497_201n), body],
      ],
      [
        "a sponsored prefix over MAX_VERIFY_GAS",
        () => [
          verify("execution", 300_000n),
          { ...payFrame(sponsors["nothing else"]!), gas: 200_000n },
          body,
        ],
      ],
      [
        "a prefix with 100,000,000 state gas",
        () => [{ ...verify("both"), stateGas: 100_000_000n }, body],
      ],
      ["a body frame first", () => [body, verify("both")]],
      [
        "a verify frame after the body",
        () => [verify("both"), body, verify("both")],
      ],
      ["two self-verify frames", () => [verify("both"), verify("both"), body]],
      ["execution approved, payment not", () => [verify("execution"), body]],
      [
        "a body frame over EIP-7825's cap",
        () => [verify("both"), { ...body, gas: 16_740_000n }],
      ],
      [
        "a body frame just under EIP-7825's cap",
        () => [verify("both"), { ...body, gas: 16_700_000n }],
      ],
      [
        "a deploy frame that leaves no code",
        () => [
          { ...body, mode: "default", target: null },
          verify("both"),
          body,
        ],
      ],
      ...Object.keys(PAY).map((name): [string, () => FrameSpec[]] => [
        `a pay frame running ${name}`,
        () => [verify("execution"), payFrame(sponsors[name]!), body],
      ]),
    ];

    for (const [name, frames] of cases)
      for (const [backend, create] of [
        ["ethereumjs", createEthereumJSBackend],
        ["revm", createRevmBackend],
      ] as const)
        it(`${name} (${backend})`, async () => {
          const specs = frames();
          const block = await reader.getBlockNumber();
          const nonce = BigInt(
            await reader.getTransactionCount({
              address: SENDER,
              blockNumber: block,
            }),
          );
          const unsigned = newTx({
            chainId: hegotaDevnet.id,
            sender: SENDER,
            nonceSeq: nonce,
            frames: toFrameRequests(specs, profile) as never,
            signatures: [secp256k1Placeholder(profile)],
            fees: FEES,
          });
          const raw = encodeTx(profile, await signTx(profile, unsigned, KEY));
          const theirs = (await simulate(
            HEGOTA_DEVNET_RPC,
            raw,
            toHex(block),
          )) as { valid: boolean; violation?: string | null };

          const sim = await create({
            upstreamRpcUrl: HEGOTA_DEVNET_RPC,
            chainId: hegotaDevnet.id,
            blockNumber: Number(block),
          });
          const action = frameAction.create({
            chainId: hegotaDevnet.id,
            from: SENDER,
            data: { frames: specs, mempool: "canonical", fees: FEES },
          });
          let ours: string | undefined;
          try {
            await frameAction.simulate!(
              action,
              sim.simContext!(action, { onLog: () => {} }),
            );
          } catch (error) {
            ours = (error as Error).message;
          }
          // Refused for the same reason, or both admitted.
          expect({
            valid: ours === undefined,
            why: ours ?? null,
          }).toEqual({
            valid: theirs.valid,
            why: theirs.valid ? null : (ours ?? `${theirs.violation}`),
          });
          if (!theirs.valid)
            console.log(`${name}: node "${theirs.violation}"; ours "${ours}"`);
        }, 120_000);
  },
);

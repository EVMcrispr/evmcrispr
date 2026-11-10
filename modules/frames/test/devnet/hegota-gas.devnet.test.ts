// Live, opt-in (EVMCRISPR_HEGOTA=1): gas parity of the in-process frame
// simulation with the Hegota devnet's own (`ethrex_simulateFrameTransaction`),
// over programs that exercise its gas schedule (Amsterdam's, with EIP-8038's
// access costs and EIP-8037's state gas, each frame's state gas drawn from its
// own `limits.state`). For every frame: the outcome, the execution gas and the
// state gas must be the chain's, exactly.
//
// The probe contracts are deployed once through the CREATE2 deployer, from
// anvil's public key #0 (the owner agreed to test sends from it); the
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
const SALT = pad("0x8141790602");

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
const at = (runtime: Hex) =>
  getContractAddress({
    opcode: "CREATE2",
    from: DEPLOYER,
    salt: SALT,
    bytecode: deployable(runtime),
  });
async function deploy(runtime: Hex): Promise<Hex> {
  const address = at(runtime);
  if ((await reader.getCode({ address }))?.length) return address;
  const hash = await wallet.sendTransaction({
    to: DEPLOYER,
    data: concat([SALT, deployable(runtime)]),
    gas: 2_000_000n,
  });
  await reader.waitForTransactionReceipt({ hash });
  return address;
}

const word = (n: bigint | string) =>
  pad(typeof n === "string" ? (n as Hex) : toHex(n));
/** An address nothing has touched. */
const fresh = () =>
  `0x5eed${Date.now().toString(16).padStart(12, "0")}${Math.floor(
    Math.random() * 2 ** 32,
  )
    .toString(16)
    .padStart(24, "0")}` as Hex;

// The programs (runtime code); each reads its argument from calldata word 0.
const P = {
  /** SSTORE(0, word 0) */
  writer: "0x5f355f5500",
  /** SLOAD(word 0) */
  sloader: "0x5f355450" + "00",
  /** SLOAD(word 0) twice: cold then warm */
  sloader2: "0x5f3554505f35545000",
  /** BALANCE(word 0) twice */
  balance2: "0x5f3531505f35315000",
  /** EXTCODESIZE, EXTCODEHASH of word 0 */
  extsize: "0x5f353b5000",
  exthash: "0x5f353f5000",
  /** EXTCODECOPY(word 0, 0, 0, 32) */
  extcopy: "0x60205f5f5f353c00",
  /** CALL(gas, word 0, 1 wei) */
  callValue: "0x5f5f5f5f60015f355af15000",
  /** CALL(gas, word 0, 0) */
  call0: "0x5f5f5f5f5f5f355af15000",
  /** STATICCALL(gas, word 0) */
  staticcall: "0x5f5f5f5f5f355afa5000",
  /** CREATE(0, calldata) */
  create: "0x365f5f37365f5ff05000",
  /** CREATE2(0, calldata, salt 0) */
  create2: "0x365f5f375f365f5ff55000",
  /** SELFDESTRUCT(word 0) */
  destruct: "0x5f35ff",
  /** SSTORE(0, 1); SSTORE(0, 0) */
  setClear: "0x60015f555f5f5500",
  /** SSTORE(1, 1); SSTORE(1, 2) */
  setSet: "0x6001600155600260015500",
  /** SSTORE(0, 1); REVERT */
  writeRevert: "0x60015f555f5ffd",
  /** LOG0 of 64 bytes, KECCAK256 of 64 bytes, TSTORE/TLOAD */
  misc: "0x60405fa060405f2050600160025d60025c5000",
  /** CALL(gas, word 0, 0); SSTORE(5, 1) */
  callThenWrite: "0x5f5f5f5f5f5f355af15060016005550" + "0",
  /** SSTORE(0, 1); SSTORE(0, 0); SSTORE(1, 1) */
  setClearSet: "0x60015f555f5f556001600155" + "00",
  /** CALL(gas, word 0, 0) with the rest of the calldata, 64 bytes back */
  callWithArgs: "0x6020360360205f3760405f602036035f5f5f355af15000",
  /** DELEGATECALL(gas, word 0) */
  delegate: "0x5f5f5f5f5f355af45000",
  /** CALLCODE(gas, word 0, 0) */
  callcode: "0x5f5f5f5f5f5f355af25000",
  /** MSTORE(0x10000, 1) */
  memory: "0x6001620100005200",
  /** MCOPY(0x20, 0, 0x20) */
  mcopy: "0x60205f60205e00",
  /** CLZ(1), SLOTNUM */
  newOps: "0x60011e504b5000",
  /** CREATE(value 1000, empty code): fails without the balance */
  createV: "0x5f5f6103e8f05000",
  /** CALL(gas, 0x…dEaD, 1 wei), then REVERT */
  sendThenRevert:
    "0x5f5f5f5f600173000000000000000000000000000000000000dead5af1505f5ffd",
  /** SELFDESTRUCT(ADDRESS) */
  destructSelf: "0x30ff",
} as const;

describe.skipIf(!ENABLED)(
  "frame gas parity with the Hegota devnet (execution and state gas)",
  () => {
    const A: Record<string, Hex> = {};
    // Anvil's public key #1, delegated (EIP-7702) to the setSet program.
    const DELEGATED = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    );
    it("deploys the programs, and delegates an account to one", async () => {
      for (const [name, runtime] of Object.entries(P))
        A[name] = await deploy(runtime as Hex);
      const designator = `0xef0100${A.setSet!.slice(2).toLowerCase()}`;
      const code = await reader.getCode({ address: DELEGATED.address });
      if (code?.toLowerCase() !== designator) {
        const authorization = await DELEGATED.signAuthorization({
          contractAddress: A.setSet!,
          chainId: chain.id,
          nonce: await reader.getTransactionCount({
            address: DELEGATED.address,
          }),
        });
        const hash = await wallet.sendTransaction({
          authorizationList: [authorization],
          to: DELEGATED.address,
          gas: 1_000_000n,
        });
        await reader.waitForTransactionReceipt({ hash });
      }
    }, 600_000);

    const verify: FrameSpec = {
      mode: "verify",
      approve: "both",
      target: null,
      data: "0x",
      value: 0n,
      gas: 30_000n,
    };
    const run = (
      target: () => Hex,
      data: () => Hex = () => "0x",
      over: Partial<FrameSpec> = {},
    ) => ({ target, data, over });
    type Step = ReturnType<typeof run>;
    const cases: [string, () => Step[]][] = [
      [
        "SSTORE a new slot",
        () => [
          run(
            () => A.writer!,
            () => word(5n),
          ),
        ],
      ],
      [
        "SSTORE a new slot, then overwrite it, then clear it (later frames)",
        () => [
          run(
            () => A.writer!,
            () => word(5n),
          ),
          run(
            () => A.writer!,
            () => word(6n),
          ),
          run(
            () => A.writer!,
            () => word(0n),
          ),
        ],
      ],
      [
        "SSTORE 0 to an empty slot",
        () => [
          run(
            () => A.writer!,
            () => word(0n),
          ),
        ],
      ],
      ["SSTORE set then clear in one frame", () => [run(() => A.setClear!)]],
      ["SSTORE set then set in one frame", () => [run(() => A.setSet!)]],
      [
        "SSTORE a new slot with the state budget 1 gas short",
        () => [
          run(
            () => A.writer!,
            () => word(5n),
            {
              stateGas: 64n * 1530n - 1n,
            },
          ),
        ],
      ],
      [
        "SLOAD cold",
        () => [
          run(
            () => A.sloader!,
            () => word(1n),
          ),
        ],
      ],
      [
        "SLOAD cold then warm",
        () => [
          run(
            () => A.sloader2!,
            () => word(1n),
          ),
        ],
      ],
      [
        "BALANCE cold then warm",
        () => [
          run(
            () => A.balance2!,
            () => word(DEAD),
          ),
        ],
      ],
      [
        "EXTCODESIZE",
        () => [
          run(
            () => A.extsize!,
            () => word(A.writer!),
          ),
        ],
      ],
      [
        "EXTCODEHASH",
        () => [
          run(
            () => A.exthash!,
            () => word(A.writer!),
          ),
        ],
      ],
      [
        "EXTCODECOPY",
        () => [
          run(
            () => A.extcopy!,
            () => word(A.writer!),
          ),
        ],
      ],
      [
        "CALL with value to an existing account",
        () => [
          run(
            () => A.callValue!,
            () => word(DEAD),
            { value: 1n },
          ),
        ],
      ],
      [
        "CALL with value to a new account",
        () => [
          run(
            () => A.callValue!,
            () => word(fresh()),
            { value: 1n },
          ),
        ],
      ],
      [
        "CALL without value to a new account",
        () => [
          run(
            () => A.call0!,
            () => word(fresh()),
          ),
        ],
      ],
      [
        "STATICCALL",
        () => [
          run(
            () => A.staticcall!,
            () => word(A.writer!),
          ),
        ],
      ],
      [
        "CALL to a contract that writes and reverts",
        () => [
          run(
            () => A.call0!,
            () => word(A.writeRevert!),
          ),
        ],
      ],
      [
        "CREATE of 10 bytes of code",
        () => [
          run(
            () => A.create!,
            () => deployable("0x00000000000000000000"),
          ),
        ],
      ],
      [
        "CREATE2 of 33 bytes of code",
        () => [
          run(
            () => A.create2!,
            () => deployable(`0x${"00".repeat(33)}`),
          ),
        ],
      ],
      [
        "CREATE with the state budget enough for the account, not the code",
        () => [
          run(
            () => A.create!,
            () => deployable(`0x${"00".repeat(10)}`),
            {
              stateGas: 120n * 1530n,
            },
          ),
        ],
      ],
      [
        "SELFDESTRUCT to an existing account",
        () => [
          run(
            () => A.destruct!,
            () => word(DEAD),
            { value: 1n },
          ),
        ],
      ],
      [
        "SELFDESTRUCT to a new account",
        () => [
          run(
            () => A.destruct!,
            () => word(fresh()),
            { value: 1n },
          ),
        ],
      ],
      ["LOG0, KECCAK256, TSTORE and TLOAD", () => [run(() => A.misc!)]],
      ...(
        [
          ["ecrecover", 0x01, `0x${"11".repeat(128)}`],
          ["sha256", 0x02, `0x${"11".repeat(64)}`],
          ["identity", 0x04, `0x${"11".repeat(64)}`],
          ["modexp", 0x05, concat([word(1n), word(1n), word(1n), "0x030507"])],
          ["bn254 add", 0x06, `0x${"00".repeat(128)}`],
          [
            "blake2f",
            0x09,
            concat(["0x0000000c", `0x${"00".repeat(64 + 128 + 16)}`, "0x01"]),
          ],
          ["bls12-381 G1 add", 0x0b, `0x${"00".repeat(256)}`],
          ["p256verify", 0x100, `0x${"00".repeat(160)}`],
        ] as [string, number, Hex][]
      ).map(([precompile, address, input]): [string, () => Step[]] => [
        `a call to the ${precompile} precompile`,
        () => [
          run(
            () => A.callWithArgs!,
            () => concat([word(BigInt(address)), input]),
          ),
        ],
      ]),
      [
        "DELEGATECALL to a program that writes",
        () => [
          run(
            () => A.delegate!,
            () => word(A.setSet!),
          ),
        ],
      ],
      [
        "CALLCODE to a program that writes",
        () => [
          run(
            () => A.callcode!,
            () => word(A.setSet!),
          ),
        ],
      ],
      ["memory expanded to 64 KiB", () => [run(() => A.memory!)]],
      ["MCOPY", () => [run(() => A.mcopy!)]],
      ["CLZ and SLOTNUM", () => [run(() => A.newOps!)]],
      [
        "CREATE with value the contract does not have",
        () => [run(() => A.createV!)],
      ],
      [
        "a call that sends value, then the caller reverts",
        () => [
          run(
            () => A.sendThenRevert!,
            () => "0x",
            { value: 1n },
          ),
        ],
      ],
      [
        "SELFDESTRUCT to itself",
        () => [
          run(
            () => A.destructSelf!,
            () => "0x",
            { value: 5n },
          ),
        ],
      ],
      [
        "SELFDESTRUCT inside init code, with value",
        () => [
          run(
            () => A.create!,
            () => "0x30ff",
            { value: 4n },
          ),
        ],
      ],
      [
        "an atomic group with a new slot, rolled back by the next frame",
        () => [
          run(
            () => A.writer!,
            () => word(5n),
            { atomic: true },
          ),
          run(() => A.writeRevert!),
        ],
      ],
      [
        "a call to an account delegated (EIP-7702) to a program that writes",
        () => [
          run(
            () => A.call0!,
            () => word(DELEGATED.address),
          ),
        ],
      ],
      [
        "a reverted child's new slot, then a new slot, with the state budget for one",
        () => [
          run(
            () => A.callThenWrite!,
            () => word(A.writeRevert!),
            {
              stateGas: 64n * 1530n,
            },
          ),
        ],
      ],
      [
        "a slot set and cleared, then another set, with the state budget for one",
        () => [
          run(
            () => A.setClearSet!,
            () => "0x",
            { stateGas: 64n * 1530n },
          ),
        ],
      ],
      [
        "a frame value transfer to a new account",
        () => [run(fresh, () => "0x", { value: 1n })],
      ],
    ];

    const rpc = async (method: string, params: unknown[]) =>
      (
        (await (
          await fetch(HEGOTA_DEVNET_RPC, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          })
        ).json()) as { result: Hex }
      ).result;

    for (const [name, steps] of cases)
      for (const [backend, create] of [
        ["ethereumjs", createEthereumJSBackend],
        ["revm", createRevmBackend],
      ] as const)
        it(`${name} (${backend})`, async () => {
          const frames: FrameSpec[] = [
            verify,
            ...steps().map(
              (s): FrameSpec => ({
                mode: "sender",
                target: s.target(),
                data: s.data(),
                value: 0n,
                gas: 200_000n,
                stateGas: 400_000n,
                ...s.over,
              }),
            ),
          ];
          const block = BigInt(await rpc("eth_blockNumber", []));
          const nonce = BigInt(
            await rpc("eth_getTransactionCount", [SENDER, toHex(block)]),
          );
          const unsigned = newTx({
            chainId: hegotaDevnet.id,
            sender: SENDER,
            nonceSeq: nonce,
            frames: toFrameRequests(frames, profile) as never,
            signatures: [secp256k1Placeholder(profile)],
            fees: { maxFeePerGas: 1_000n, maxPriorityFeePerGas: 1n },
          });
          const signed = await signTx(profile, unsigned, KEY);
          const raw = encodeTx(profile, signed);
          const theirs = (await simulate(
            HEGOTA_DEVNET_RPC,
            raw,
            toHex(block),
          )) as {
            gasUsed: Hex;
            frames: { gasUsed: Hex; stateGasUsed: Hex; succeeded: boolean }[];
          };

          const sim = await create({
            upstreamRpcUrl: HEGOTA_DEVNET_RPC,
            chainId: hegotaDevnet.id,
            blockNumber: Number(block),
          });
          const action = frameAction.create({
            chainId: hegotaDevnet.id,
            from: SENDER,
            data: { frames, mempool: "canonical" },
          });
          const ours = (await frameAction.simulate!(
            action,
            sim.simContext!(action, { onLog: () => {} }),
          )) as unknown as {
            gasUsed: bigint;
            frameReceipts: {
              status: string;
              gasUsed: bigint;
              stateGasUsed?: bigint;
            }[];
          };

          const show = (list: { ok: boolean; exec: bigint; state: bigint }[]) =>
            list.map((f) => `${f.ok ? "ok" : "failed"} ${f.exec}+${f.state}`);
          // The sender's verify frame is impersonated in ours: compared
          // from the first body frame.
          expect(
            show(
              ours.frameReceipts.slice(1).map((f) => ({
                ok: f.status === "success",
                exec: f.gasUsed,
                state: f.stateGasUsed ?? 0n,
              })),
            ),
          ).toEqual(
            show(
              theirs.frames.slice(1).map((f) => ({
                ok: f.succeeded,
                exec: BigInt(f.gasUsed),
                state: BigInt(f.stateGasUsed),
              })),
            ),
          );
          // The transaction's gas used, as the fee prices it. Ours prices the
          // signature as if none of its bytes were zero: the chain's real one
          // costs 12 gas less for each that is (unless the floor decides).
          const signature = (
            signed as unknown as { signatures: { signature: Hex }[] }
          ).signatures[0]!.signature;
          const zeros = BigInt(
            signature
              .slice(2)
              .match(/../g)!
              .filter((b) => b === "00").length,
          );
          const over = ours.gasUsed - BigInt(theirs.gasUsed);
          // When the refund is capped (a fifth of the gas used), the chain's
          // lower total lowers its cap too, by a fifth of the difference.
          const less = 12n * zeros;
          const allowed = [0n, less, less - less / 5n, less - less / 5n - 1n];
          expect(allowed).toContain(over);
        }, 120_000);
  },
);

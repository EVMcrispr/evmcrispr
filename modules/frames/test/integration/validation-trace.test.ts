// The validation frames of a frame account and its sponsor, as the frames
// module lays them out, keep the Hegota devnet's mempool trace rules. A fork
// cannot check the sender's own verify frame (it impersonates it: it holds no
// signature), so this runs it here with its owner's real signature, on both
// backends, with the frame opcodes and the trace observer on: it must
// approve, and break no rule. A plain anvil on the devnet's chain id stands
// in for it, so the fork applies that network's profile and gas schedule.
import "../setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ModuleActionSimCtx, SimCallResult } from "@evmcrispr/sdk";
import {
  hegotaDevnet,
  ethrexHegotaDevnetProfile as profile,
} from "@evmcrispr/viem-frames";
import type { Subprocess } from "bun";
import {
  type Address,
  concatHex,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  type Hex,
  pad,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createEthereumJSBackend } from "../../../sim/src/lib/ethereumjs-backend";
import { createRevmBackend } from "../../../sim/src/lib/revm-backend";
import { frameAccountTypedData } from "../../src/account";
import { frameAction } from "../../src/actions";
import { accountContracts } from "../../src/addresses";
import { frameAccountFactoryAbi } from "../../src/contracts/artifacts";
import {
  ACCOUNT_CHECK_GAS,
  layoutFrames,
  PAYMASTER_VERIFY_GAS,
} from "../../src/layout";
import { OBSERVED, traceViolation } from "../../src/simulate/admission";
import { type FrameContext, frameOpcodes } from "../../src/simulate/opcodes";

const PORT = Number(process.env.EVMCRISPR_FRAMES_TRACE_PORT ?? 8599);
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN = hegotaDevnet.id;
/** Anvil's key #0: funded on the stand-in, the account's owner. */
const OWNER = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const DEAD = "0x000000000000000000000000000000000000dEaD";
const ENTRY_POINT = getAddress(profile.entryPoint);
const contracts = accountContracts(CHAIN);

let anvil: Subprocess | undefined;
beforeAll(async () => {
  anvil = Bun.spawn(
    ["anvil", "--chain-id", String(CHAIN), "--port", String(PORT), "--silent"],
    { stdout: "ignore", stderr: "ignore" },
  );
  for (let i = 0; i < 100; i++) {
    const up = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}',
    }).catch(() => undefined);
    if (up?.ok) return;
    await Bun.sleep(100);
  }
  throw new Error("anvil did not start");
});
afterAll(() => anvil?.kill());

const ok = (r: SimCallResult, what: string) => {
  if (!r.success) throw new Error(`${what} failed: ${r.error} ${r.returnData}`);
  return r;
};

for (const [backend, create] of [
  ["ethereumjs", createEthereumJSBackend],
  ["revm", createRevmBackend],
] as const)
  describe(`a frame account's validation frames keep the mempool's trace rules – ${backend}`, () => {
    it("the account's own verify frame, signed by its owner, and its sponsor's", async () => {
      const fork = await create({ upstreamRpcUrl: RPC, chainId: CHAIN });
      const dummy = frameAction.create({
        chainId: CHAIN,
        from: OWNER.address,
        data: { frames: [], mempool: "canonical" },
      });
      const sim: ModuleActionSimCtx = fork.simContext!(dummy, {
        onLog: () => {},
      });
      const deploy = (to: Address, data: Hex) =>
        sim.call({
          caller: OWNER.address,
          to,
          data,
          value: 0n,
          gas: 10_000_000n,
          isStatic: false,
        });

      // The Hegota build of the implementation and the factory, then the
      // owner's account and a sponsor for it.
      for (const tx of contracts.deploymentTransactions())
        ok(await deploy(tx.to, tx.data), "a deployment");
      const created = ok(
        await deploy(
          contracts.factory,
          encodeFunctionData({
            abi: frameAccountFactoryAbi,
            functionName: "createAccount",
            args: [OWNER.address, 0n],
          }),
        ),
        "createAccount",
      );
      const account = decodeFunctionResult({
        abi: frameAccountFactoryAbi,
        functionName: "createAccount",
        data: created.returnData,
      }) as Address;
      expect(account).toBe(contracts.predictAccountAddress(OWNER.address, 0n));
      const sponsorCreation = ok(
        await deploy(
          "0x4e59b44847b379578588920cA78FbF26c0B4956C",
          concatHex([
            pad("0x01"),
            contracts.sponsorBytecode,
            encodeAbiParameters(
              [{ type: "address" }, { type: "address" }],
              [OWNER.address, account],
            ),
          ]),
        ),
        "the sponsor's deployment",
      );
      const sponsor = getAddress(sponsorCreation.returnData);
      await sim.setBalance(sponsor, 10n ** 18n);

      // The frames `frames:tx --account … --paymaster …` lays out.
      const specs = layoutFrames({
        actions: [{ to: DEAD, data: "0x", value: 0n, gas: 50_000n }],
        sender: account,
        chainId: CHAIN,
        accountChecks: true,
        paymaster: sponsor,
      } as never);
      expect(specs.slice(0, 2).map((f) => [f.approve, f.gas])).toEqual([
        ["execution", ACCOUNT_CHECK_GAS],
        ["payment", PAYMASTER_VERIFY_GAS],
      ]);
      const sigHash = pad("0x8141", { size: 32 });
      const signature = await OWNER.signTypedData(
        frameAccountTypedData(account, sigHash, CHAIN),
      );
      const scope = (f: (typeof specs)[number]) =>
        f.approve === "execution" ? 2 : f.approve === "payment" ? 1 : 3;
      const frames = specs.map((f) => ({
        mode:
          f.mode === "verify"
            ? profile.frameModes.VERIFY!
            : profile.frameModes.SENDER!,
        flags: f.mode === "verify" ? scope(f) : 0,
        target: getAddress(f.target ?? account),
        data: f.data,
        value: f.value,
        gas: f.gas!,
        stateGas: f.stateGas ?? 0n,
      }));
      const ctx: FrameContext = {
        profile,
        sender: account,
        nonce: 0n,
        maxFeePerGas: 0n,
        maxPriorityFeePerGas: 0n,
        sigHash,
        frames,
        current: -1,
        statuses: [],
        gasUsed: [],
        signature: {
          scheme: profile.sigSchemes.ARBITRARY!,
          signer: zeroAddress,
          data: signature,
        },
      };

      for (const [i, who] of [
        [0, "the account"],
        [1, "the sponsor"],
      ] as const) {
        const f = frames[i]!;
        ctx.current = i;
        ctx.approved = undefined;
        const result = await sim.withOpcodes(frameOpcodes(ctx), () =>
          sim.call({
            caller: ENTRY_POINT,
            to: f.target,
            data: f.data,
            value: 0n,
            gas: f.gas,
            isStatic: true,
            schedule: "hegota",
            stateGas: 0n,
            observe: OBSERVED,
          }),
        );
        ok(result, `${who}'s verify frame`);
        // Set by APPROVE during the call (narrowed to undefined above).
        expect(ctx.approved as number | undefined).toBe(f.flags);
        // It ran calls the rules look at (the clone's DELEGATECALL, the
        // signature's reads), and broke none.
        expect(result.steps?.length).toBeGreaterThan(0);
        expect(
          await traceViolation(result.steps ?? [], {
            sender: account,
            deploy: false,
            read: async (a) => ({
              code: await sim.getCode(a),
              balance: await sim.getBalance(a),
              nonce: await sim.getNonce(a),
            }),
          }),
        ).toBeUndefined();
      }

      // The control: a signature by another key does not approve.
      ctx.current = 0;
      ctx.approved = undefined;
      ctx.signature = {
        ...ctx.signature,
        data: await privateKeyToAccount(
          "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        ).signTypedData(frameAccountTypedData(account, sigHash, CHAIN)),
      };
      const forged = await sim.withOpcodes(frameOpcodes(ctx), () =>
        sim.call({
          caller: ENTRY_POINT,
          to: account,
          data: frames[0]!.data,
          value: 0n,
          gas: frames[0]!.gas,
          isStatic: true,
          schedule: "hegota",
          stateGas: 0n,
        }),
      );
      expect(forged.success).toBe(false);
      expect(ctx.approved).toBeUndefined();
    }, 120_000);
  });

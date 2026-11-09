// Live, opt-in (EVMCRISPR_HEGOTA=1, `bun run test:hegota`): post-verify on
// the public Hegota devnet. Each script is simulated first (sim:fork on a
// fork of the chain, both in-process backends), then sent from anvil #0 (a
// public key with devnet ETH there; the owner agreed to test sends from it)
// through a wallet signing type 0x06 with the chain's profile. The fork and
// the chain must agree on whether the check holds.
import "../setup";
import { describe, expect, it } from "bun:test";
import type { ModuleActionSendCtx } from "@evmcrispr/sdk";
import { getTransports } from "@evmcrispr/test-utils";
import {
  createInterpreter,
  evml,
  Interpreter,
} from "@evmcrispr/test-utils/evml";
import {
  HEGOTA_DEVNET_RPC,
  parseFrameTransactionRequest,
  ethrexHegotaDevnetProfile as profile,
} from "@evmcrispr/viem-frames";
import { encodeTx, signTx } from "@forshtat/hegota-support/tx";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { frameAction } from "../../src/actions";
import type { FrameModuleAction } from "../../src/frame-action";

const ENABLED = process.env.EVMCRISPR_HEGOTA === "1";
const HEGOTA = 3151908;
const KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const SENDER = privateKeyToAccount(KEY).address;
const DEAD = "0x000000000000000000000000000000000000dEaD";
// The hegota demo's ExactBeneficiaryAssertion and RequiredEventAssertion
// on the chain.
const EXACT_BENEFICIARY = "0x643DfBbbA8a30f9b2e79c5b0B3589106E2fd8DbF";
const REQUIRED_EVENT = "0x0c1fA596B6ADA68deB19F67B15f5B99eA43B9C13";
const TRANSFER =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const transport = http(HEGOTA_DEVNET_RPC);
const reader = createPublicClient({ transport });

/** A `frames:tx` that sends 1 wei to `0x…dEaD`, then `checks`. */
const script = (checks: string) =>
  [
    "tx --gas 300000 (",
    `  send ${DEAD} --value 1 --gas 50000`,
    "  post-verify (",
    `    ${checks}`,
    "  )",
    ")",
  ].join("\n");

/** The fork's verdict: whether a post-verify frame failed. */
async function simulated(using: string, checks: string): Promise<boolean> {
  const interpreter = createInterpreter(
    [
      "load sim",
      "load frames [tx post-verify]",
      `sim:fork --using ${using} --on hegotaDevnet --as ${SENDER} (`,
      ...script(checks).split("\n"),
      ")",
    ].join("\n"),
    reader as never,
    { chainId: HEGOTA },
  );
  try {
    await interpreter.interpret();
    return true;
  } catch (error) {
    if (String(error).includes("A post-verify check failed")) return false;
    throw error;
  }
}

/** The chain's verdict: the frame action sent, mined, judged. */
async function sent(checks: string): Promise<boolean> {
  // Anvil #0 is the run's own account (no switch --as outside a fork).
  const interpreter = new Interpreter(evml.registry, {
    account: SENDER,
    chainId: HEGOTA,
    transports: getTransports(),
  });
  const [action] = (await interpreter.interpret(
    `load frames [tx post-verify]\n${script(checks)}`,
  )) as FrameModuleAction[];
  const wallet = createWalletClient({
    account: SENDER,
    transport: custom({
      async request({ method, params }: { method: string; params: any }) {
        if (method === "eth_chainId") return `0x${HEGOTA.toString(16)}`;
        if (method === "eth_accounts") return [SENDER];
        if (method === "eth_signTransaction") {
          const tx = parseFrameTransactionRequest(params[0], profile);
          return encodeTx(profile, await signTx(profile, tx, KEY));
        }
        throw new Error(`unexpected ${method}`);
      },
    }),
  });
  const ctx = {
    walletClient: wallet,
    getPublicClient: () => reader,
    transports: { [HEGOTA]: transport },
    onLog: () => {},
  } as unknown as ModuleActionSendCtx;
  try {
    await frameAction.send(action!, ctx);
    return true;
  } catch (error) {
    if ((error as Error).message.startsWith("A post-verify check failed"))
      return false;
    throw error;
  }
}

/** Name, checks, whether they hold on the chain, and on the fork when it
 *  differs (a known gap of the simulation). */
const CASES: [string, string, boolean, boolean?][] = [
  ["an assert that holds", `assert @balance!(ETH ${DEAD}) >= 1`, true],
  ["an assert that fails", `assert @balance!(ETH ${DEAD}) == 1`, false],
  [
    "the demo's check that only 0x…dEaD gained ETH",
    `exec ${EXACT_BENEFICIARY} "assertExactBeneficiary(address)" ${DEAD}`,
    true,
  ],
  [
    "the demo's check that only another address gained ETH",
    `exec ${EXACT_BENEFICIARY} "assertExactBeneficiary(address)" 0x000000000000000000000000000000000000bEEF`,
    false,
  ],
  [
    "the demo's check for the transfer's event (EIP-7708, which the fork does not emit)",
    `exec ${REQUIRED_EVENT} "assertRequiredEvent(bytes32,uint256)" ${TRANSFER} 1`,
    true,
    false,
  ],
];

describe.skipIf(!ENABLED)("post-verify on the Hegota devnet", () => {
  for (const [name, checks, holds, onFork = holds] of CASES)
    it(`${name}: it ${holds ? "holds" : "fails"} on the chain${onFork === holds ? ", and the fork agrees" : ", not on the fork"}`, async () => {
      for (const using of ["ethereumjs", "revm"])
        expect(await simulated(using, checks)).toBe(onFork);
      expect(await sent(checks)).toBe(holds);
    }, 300_000);
});

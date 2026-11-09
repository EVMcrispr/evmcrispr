import type { Action, TerminalAction } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { buildApprovalActions } from "@evmcrispr/sdk/onchain";
import type { Address } from "viem";
import { encodeFunctionData } from "viem";
import type Ens from "..";
import {
  defaultPaymentTokenMap,
  ethRegistrarMap,
  requireAddress,
} from "../addresses";
import {
  buildRegistration,
  commitmentArgs,
  ethRegistrarAbi,
} from "../ethRegistrar";
import { assertSupportedChain, eth2LDLabel } from "../utils";

const STEPS = [
  "commit-wait-reveal",
  "only-commit",
  "only-reveal",
  "only-commit-and-wait",
  "only-wait-and-reveal",
] as const;
type Step = (typeof STEPS)[number];

// Margin on top of the registrar's MIN_COMMITMENT_AGE so the reveal lands
// safely past the minimum age even with slow block inclusion.
const WAIT_MARGIN_SECONDS = 12;

export default defineCommand<Ens>({
  smartSupport: {
    kind: "static",
    reason:
      "Commitment hashing and price quotes require concrete registration inputs.",
  },
  name: "register",
  description:
    "Register a .eth name with ENSv2's ETHRegistrar: commit, wait, then approve the payment token (USDC by default) and reveal, in one go by default.",
  batchable: (_args, opts) => {
    const step = (opts.step ?? "commit-wait-reveal") as string;
    return step === "only-commit" || step === "only-reveal"
      ? true
      : `register --step ${step} includes a wait step and cannot be batched (use --step only-commit / only-reveal)`;
  },
  args: [
    {
      name: "name",
      type: "string",
      description: ".eth name or label (e.g. mydao.eth or mydao)",
    },
    { name: "owner", type: "address", description: "Owner of the name" },
    {
      name: "duration",
      type: "number",
      description:
        "Registration duration, in time units (e.g. 1y); 28 days at least",
    },
  ],
  opts: [
    {
      name: "secret",
      type: "bytes32",
      description:
        "Commitment secret; must be identical across the commit and reveal steps",
    },
    {
      name: "payment-token",
      type: "address",
      description:
        "ERC-20 the registration is paid in, from the sender: USDC (default) or DAI",
    },
    {
      name: "resolver",
      type: "address",
      description: "Resolver to set at registration (default: none)",
    },
    {
      name: "subregistry",
      type: "address",
      description: "Registry for the name's subnames (default: none)",
    },
    {
      name: "reverse-record",
      type: "bool",
      description:
        "Not available on ENSv2: set the primary name with ens:set-primary-name instead",
    },
    {
      name: "step",
      type: "string",
      description:
        "Which part of the flow to run: commit-wait-reveal (default), only-commit, only-reveal, only-commit-and-wait, only-wait-and-reveal",
    },
  ],
  async run(module, { name, owner, duration }, { opts }) {
    const step = (opts.step ?? "commit-wait-reveal") as Step;
    if (!STEPS.includes(step)) {
      throw new ErrorException(
        `invalid --step "${step}"; valid steps: ${STEPS.join(", ")}`,
      );
    }

    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const registrar = requireAddress(ethRegistrarMap, chainId, "ETHRegistrar");
    const label = name.includes(".") ? eth2LDLabel(name) : name;
    const registration = buildRegistration(label, owner, duration, opts);
    const client = await module.getClient();

    const doCommit = step !== "only-reveal" && step !== "only-wait-and-reveal";
    const doWait = step !== "only-commit" && step !== "only-reveal";
    const doReveal = step !== "only-commit" && step !== "only-commit-and-wait";

    const actions: Action[] = [];

    if (doCommit) {
      const minDuration = await client.readContract({
        address: registrar,
        abi: ethRegistrarAbi,
        functionName: "MIN_REGISTER_DURATION",
      });
      if (registration.duration < minDuration) {
        throw new ErrorException(
          `a registration lasts ${minDuration / 86400n} days at least, got ${registration.duration / 86400n}`,
        );
      }
      const commitment = await client.readContract({
        address: registrar,
        abi: ethRegistrarAbi,
        functionName: "makeCommitment",
        args: commitmentArgs(registration),
      });
      actions.push({
        to: registrar,
        data: encodeFunctionData({
          abi: ethRegistrarAbi,
          functionName: "commit",
          args: [commitment],
        }),
      });
    }

    if (doWait) {
      const minCommitmentAge = await client.readContract({
        address: registrar,
        abi: ethRegistrarAbi,
        functionName: "MIN_COMMITMENT_AGE",
      });
      const wait: TerminalAction = {
        type: "terminal",
        command: "wait",
        args: { seconds: Number(minCommitmentAge) + WAIT_MARGIN_SECONDS },
      };
      actions.push(wait);
    }

    if (doReveal) {
      const paymentToken: Address =
        opts["payment-token"] ??
        requireAddress(defaultPaymentTokenMap, chainId, "USDC");
      // Quoted when the script is built. The base is fixed in the token's
      // units and a premium only decays, so the reveal never costs more.
      const [base, premium] = await client
        .readContract({
          address: registrar,
          abi: ethRegistrarAbi,
          functionName: "getRegisterPrice",
          args: [label, registration.duration, paymentToken],
        })
        .catch(() => {
          throw new ErrorException(
            `the ETHRegistrar quotes no price for ${label}.eth in ${paymentToken}: the name may be taken, or the token is not one it accepts (USDC or DAI)`,
          );
        });
      const payer = await module.getSender();
      actions.push(
        ...(await buildApprovalActions(
          module,
          paymentToken,
          payer,
          registrar,
          base + premium,
        )),
      );
      actions.push({
        to: registrar,
        data: encodeFunctionData({
          abi: ethRegistrarAbi,
          functionName: "register",
          args: [
            registration.label,
            registration.owner,
            registration.secret,
            registration.subregistry,
            registration.resolver,
            registration.duration,
            paymentToken,
            registration.referrer,
          ],
        }),
      });
    }

    return actions;
  },
});

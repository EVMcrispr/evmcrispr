import type { Action, TerminalAction } from "@evmcrispr/sdk";
import { defineCommand, ErrorException, encodeAction } from "@evmcrispr/sdk";
import { encodeFunctionData } from "viem";
import type Ens from "..";
import {
  ethRegistrarControllerMap,
  publicResolverMap,
  requireAddress,
} from "../addresses";
import { buildRegistration, controllerAbi } from "../registrarController";
import { assertSupportedChain, eth2LDLabel } from "../utils";

const STEPS = [
  "commit-wait-reveal",
  "only-commit",
  "only-reveal",
  "only-commit-and-wait",
  "only-wait-and-reveal",
] as const;
type Step = (typeof STEPS)[number];

// Margin on top of the controller's minCommitmentAge so the reveal lands
// safely past the minimum age even with slow block inclusion.
const WAIT_MARGIN_SECONDS = 12;

export default defineCommand<Ens>({
  name: "register",
  description:
    "Register a .eth name via the controller's commit/reveal flow (commits, waits and reveals in one go by default).",
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
      description: "Registration duration, in time units (e.g. 1y)",
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
      name: "resolver",
      type: "address",
      description:
        "Resolver to set at registration (defaults to the chain's Public Resolver)",
    },
    {
      name: "reverse-record",
      type: "bool",
      description: "Also set the owner's primary ENS name",
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
    const controller = requireAddress(
      ethRegistrarControllerMap,
      chainId,
      "ETHRegistrarController",
    );
    const label = name.includes(".") ? eth2LDLabel(name) : name;
    const registration = buildRegistration(
      label,
      owner,
      duration,
      opts,
      requireAddress(publicResolverMap, chainId, "PublicResolver"),
    );
    const client = await module.getClient();

    const doCommit = step !== "only-reveal" && step !== "only-wait-and-reveal";
    const doWait = step !== "only-commit" && step !== "only-reveal";
    const doReveal = step !== "only-commit" && step !== "only-commit-and-wait";

    const actions: Action[] = [];

    if (doCommit) {
      const commitment = await client.readContract({
        address: controller,
        abi: controllerAbi,
        functionName: "makeCommitment",
        args: [registration],
      });
      actions.push(encodeAction(controller, "commit(bytes32)", [commitment]));
    }

    if (doWait) {
      const minCommitmentAge = await client.readContract({
        address: controller,
        abi: controllerAbi,
        functionName: "minCommitmentAge",
      });
      const wait: TerminalAction = {
        type: "terminal",
        command: "wait",
        args: { seconds: Number(minCommitmentAge) + WAIT_MARGIN_SECONDS },
      };
      actions.push(wait);
    }

    if (doReveal) {
      const price = await client.readContract({
        address: controller,
        abi: controllerAbi,
        functionName: "rentPrice",
        args: [label, registration.duration],
      });
      // 2% buffer against oracle price movement; the controller refunds excess
      const value = ((price.base + price.premium) * 102n) / 100n;

      actions.push({
        to: controller,
        data: encodeFunctionData({
          abi: controllerAbi,
          functionName: "register",
          args: [registration],
        }),
        value,
      });
    }

    return actions;
  },
});

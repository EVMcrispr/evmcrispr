import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import {
  coreCall,
  encodeOrElse,
  staticCallParam,
} from "@evmcrispr/sdk/onchain";
import type { Hex } from "viem";
import { encodeFunctionData, getAddress, isAddress, isHex } from "viem";
import type Governor from "..";
import { governorAbi, hashDescription, hashProposalLocal } from "../utils";

export default defineHelper<Governor>({
  name: "proposalId",
  batchable: false,
  description:
    "Proposal id of a Governor proposal, derived from its targets, values, calldatas and description. Prefer the optional variable of governor:propose when creating the proposal in the same script.",
  compileDescription:
    "Tries `getProposalId` and falls back to `hashProposal`, whichever derivation the governor exposes.",
  returnType: "number",
  args: [
    { name: "governor", type: "address", description: "Governor address" },
    { name: "targets", type: "array", description: "Target addresses" },
    { name: "values", type: "array", description: "ETH values in wei" },
    { name: "calldatas", type: "array", description: "Encoded calldata bytes" },
    {
      name: "description",
      type: "string",
      description: "Proposal description",
    },
  ],
  async run(module, { governor, targets, values, calldatas, description }) {
    const parsedTargets = (targets as unknown[]).map((t) => {
      if (typeof t !== "string" || !isAddress(t)) {
        throw new ErrorException(`<targets> must contain addresses, got ${t}`);
      }
      return t;
    });
    const parsedValues = (values as unknown[]).map((v) => {
      const num = v instanceof Num ? v : Num(String(v));
      return num.toBigInt();
    });
    const parsedCalldatas = (calldatas as unknown[]).map((c) => {
      if (typeof c !== "string" || !isHex(c)) {
        throw new ErrorException(
          `<calldatas> must contain hex bytes, got ${c}`,
        );
      }
      return c as Hex;
    });
    const descriptionHash = hashDescription(description);

    const client = await module.getClient();
    for (const functionName of ["getProposalId", "hashProposal"] as const) {
      try {
        const id = await client.readContract({
          address: governor,
          abi: governorAbi,
          functionName,
          args: [parsedTargets, parsedValues, parsedCalldatas, descriptionHash],
        });
        return Num.fromBigInt(id);
      } catch {
        // fall through to the next resolution strategy
      }
    }
    return Num.fromBigInt(
      hashProposalLocal(
        parsedTargets,
        parsedValues,
        parsedCalldatas,
        descriptionHash,
      ),
    );
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 5) {
      throw new ErrorException(
        "@proposalId! expects (governor targets values calldatas description)",
      );
    }
    const [governor, targets, values, calldatas, description] =
      await Promise.all(
        node.args.map((n) => ctx.interpreters.interpretNode(n)),
      );
    const parsedTargets = (targets as unknown[]).map((t) => {
      if (typeof t !== "string" || !isAddress(t)) {
        throw new ErrorException(`<targets> must contain addresses, got ${t}`);
      }
      return t;
    });
    const parsedValues = (values as unknown[]).map((v) =>
      (v instanceof Num ? v : Num(String(v))).toBigInt(),
    );
    const parsedCalldatas = (calldatas as unknown[]).map((c) => {
      if (typeof c !== "string" || !isHex(c)) {
        throw new ErrorException(
          `<calldatas> must contain hex bytes, got ${c}`,
        );
      }
      return c as Hex;
    });
    const args = [
      parsedTargets,
      parsedValues,
      parsedCalldatas,
      hashDescription(String(description)),
    ] as const;
    // orElse: modern governors expose getProposalId, older ones only
    // hashProposal — the first derivation that resolves wins on-chain.
    return coreCall(
      ctx,
      encodeOrElse(
        staticCallParam(
          getAddress(String(governor)),
          encodeFunctionData({
            abi: governorAbi,
            functionName: "getProposalId",
            args,
          }),
        ),
        staticCallParam(
          getAddress(String(governor)),
          encodeFunctionData({
            abi: governorAbi,
            functionName: "hashProposal",
            args,
          }),
        ),
      ),
      "Uint",
    );
  },
});

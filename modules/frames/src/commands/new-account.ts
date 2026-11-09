import {
  type Address,
  BindingsSpace,
  defineCommand,
  ErrorException,
} from "@evmcrispr/sdk";
import { encodeFunctionData } from "viem";
import type Frames from "..";
import { accountContracts, DETERMINISTIC_DEPLOYER } from "../addresses";
import { frameAccountFactoryAbi } from "../contracts/artifacts";
import { sendInline, sendingChainId } from "../deploy";
import { saltValue } from "../salt";

export default defineCommand<Frames>({
  smartSupport: {
    kind: "incompatible",
    reason: "The account is created now, by a transaction of its own.",
  },
  name: "new-account",
  description:
    "Create the frame account of an owner (default `@me`) through the factory, and bind its address to <variable>. Idempotent: an existing account is only bound.",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the account address to",
    },
  ],
  opts: [
    {
      name: "owner",
      type: "address",
      description: "Owner whose signature the account accepts (default `@me`)",
    },
    {
      name: "salt",
      type: "number",
      description: "Which of the owner's accounts (default 0)",
    },
  ],
  async run(module, { variable }, { opts, interpreters }) {
    const owner =
      (opts.owner as Address | undefined) ??
      (await module.getConnectedAccount(true));
    const salt = saltValue(opts.salt, "--salt");
    const chainId = await sendingChainId(module);
    const client = await module.getClient();
    const hasCode = async (address: Address) => {
      const code = await client.getCode({ address });
      return code !== undefined && code !== "0x";
    };

    // The implementation and the factory, once per chain, each only when it
    // is missing (a chain left half-deployed is resumed). Gas is the
    // wallet's estimate: state gas makes fixed limits a guess.
    const contracts = accountContracts(chainId);
    const [implementation, factory] = contracts.deploymentTransactions();
    for (const [address, tx] of [
      [contracts.implementation, implementation!],
      [contracts.factory, factory!],
    ] as const) {
      if (await hasCode(address)) continue;
      if (!(await hasCode(DETERMINISTIC_DEPLOYER)))
        throw new ErrorException(
          `this chain has no deterministic deployer at ${DETERMINISTIC_DEPLOYER}, which the frame account contracts are deployed through`,
        );
      await sendInline(module, interpreters, { ...tx, chainId });
      if (!(await hasCode(address)))
        throw new ErrorException(
          `the deterministic deployer did not deploy ${address}`,
        );
    }

    const account = contracts.predictAccountAddress(owner, salt);
    if (!(await hasCode(account))) {
      await sendInline(module, interpreters, {
        to: contracts.factory,
        data: encodeFunctionData({
          abi: frameAccountFactoryAbi,
          functionName: "createAccount",
          args: [owner, salt],
        }),
        chainId,
      });
      if (!(await hasCode(account)))
        throw new ErrorException(
          `the factory did not create the account at ${account}`,
        );
    }

    module.bindingsManager.setBinding(
      variable,
      account,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );
    return [];
  },
});

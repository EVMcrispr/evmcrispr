import type { WalletAction } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  NodeType,
} from "@evmcrispr/sdk";
import {
  getTypesForEIP712Domain,
  hashDomain,
  hashStruct,
  hashTypedData,
} from "viem";
import type Std from "..";

const { VariableIdentifier } = NodeType;
const { USER } = BindingsSpace;

export default defineCommand<Std>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "sign",
  description: "Sign a message or typed data with the connected wallet.",
  batchable: false,
  args: [
    { name: "variable", type: "variable", description: "Variable name" },
    {
      name: "message",
      type: "string",
      description: "Plain-text message to sign",
      optional: true,
    },
  ],
  opts: [
    {
      name: "typed",
      type: "string",
      description: "EIP-712 typed data JSON string",
    },
  ],
  async run(module, { message }, { opts, node, interpreters }) {
    const typedDataJSON = opts.typed;
    const [varNode] = node.args;

    if (varNode.type !== VariableIdentifier) {
      throw new ErrorException(
        "expected a variable identifier as first argument",
      );
    }

    // If --typed is provided, only 1 arg needed; otherwise 2
    if (typedDataJSON && node.args.length !== 1) {
      throw new ErrorException(
        "sign --typed expects exactly 1 argument (the variable name)",
      );
    }
    if (!typedDataJSON && node.args.length !== 2) {
      throw new ErrorException(
        "sign expects exactly 2 arguments (variable and message)",
      );
    }

    const { actionCallback } = interpreters;
    if (!actionCallback) {
      throw new ErrorException(
        "sign requires an execution context with wallet access",
      );
    }

    if (interpreters.simulation)
      throw new ErrorException(
        "sign cannot request wallet signatures during simulation",
      );
    const varName = varNode.value;
    let action: WalletAction;

    if (typedDataJSON) {
      const typed = JSON.parse(typedDataJSON);
      const types = {
        EIP712Domain: getTypesForEIP712Domain({ domain: typed.domain ?? {} }),
        ...typed.types,
      };
      const domainHash = hashDomain({
        domain: typed.domain ?? {},
        types,
      });
      const messageHash =
        typed.primaryType === "EIP712Domain"
          ? domainHash
          : hashStruct({
              data: typed.message,
              primaryType: typed.primaryType,
              types,
            });
      module.context.log(
        `EIP-712 signing payload\n  Domain hash: ${domainHash}\n  Message hash: ${messageHash}\n  Final hash: ${hashTypedData(typed)}`,
      );
      const account = await module.getConnectedAccount();
      action = {
        type: "wallet",
        method: "eth_signTypedData_v4",
        params: [account, typedDataJSON],
      };
    } else {
      const account = await module.getConnectedAccount();
      action = {
        type: "wallet",
        method: "personal_sign",
        params: [message, account],
      };
    }

    const signature = (await actionCallback(action)) as string;

    module.bindingsManager.setBinding(
      varName,
      signature,
      USER,
      true,
      undefined,
      true,
    );

    return [];
  },
});

import type { WalletAction } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  NodeType,
} from "@evmcrispr/sdk";
import type Std from "..";

const { VariableIdentifier } = NodeType;
const { USER } = BindingsSpace;

export default defineCommand<Std>({
  name: "sign",
  description: "Sign a message or typed data with the connected wallet.",
  args: [
    { name: "variable", type: "variable" },
    { name: "message", type: "string", optional: true },
  ],
  opts: [{ name: "typed", type: "string" }],
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

    const varName = varNode.value;
    let action: WalletAction;

    if (typedDataJSON) {
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

    const { actionCallback } = interpreters;
    if (!actionCallback) {
      throw new ErrorException(
        "sign requires an execution context with wallet access",
      );
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

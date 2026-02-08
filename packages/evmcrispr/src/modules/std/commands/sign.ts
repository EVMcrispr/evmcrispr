import { ErrorException } from "../../../errors";
import type { ICommand, WalletAction } from "../../../types";
import { BindingsSpace, NodeType } from "../../../types";
import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  getOptValue,
} from "../../../utils";
import type { Std } from "../Std";

const { VariableIdentifier } = NodeType;
const { USER } = BindingsSpace;

export const sign: ICommand<Std> = {
  async run(module, c, { interpretNode, actionCallback }) {
    checkOpts(c, ["typed"]);

    const typedDataJSON = await getOptValue(c, "typed", interpretNode);

    if (typedDataJSON) {
      checkArgsLength(c, { type: ComparisonType.Equal, minValue: 1 });
    } else {
      checkArgsLength(c, { type: ComparisonType.Equal, minValue: 2 });
    }

    const [varNode, messageNode] = c.args;

    if (varNode.type !== VariableIdentifier) {
      throw new ErrorException(
        "expected a variable identifier as first argument",
      );
    }

    const varName = varNode.value;
    let action: WalletAction;

    if (typedDataJSON) {
      // EIP-712: Sign typed structured data
      const account = await module.getConnectedAccount();
      action = {
        type: "wallet",
        method: "eth_signTypedData_v4",
        params: [account, typedDataJSON],
      };
    } else {
      // EIP-191: Sign a plain text message
      const message = await interpretNode(messageNode);
      const account = await module.getConnectedAccount();
      action = {
        type: "wallet",
        method: "personal_sign",
        params: [message, account],
      };
    }

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

    return []; // action already dispatched
  },
  buildCompletionItemsForArg() {
    return [];
  },
  async runEagerExecution() {
    return;
  },
};

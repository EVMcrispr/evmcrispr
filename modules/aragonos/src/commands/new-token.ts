import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  encodeAction,
  NodeType,
} from "@evmcrispr/sdk";
import { getContractAddress, zeroAddress } from "viem";
import type AragonOS from "..";
import { buildNonceForAddress, MINIME_TOKEN_FACTORIES } from "../utils";

export default defineCommand<AragonOS>({
  name: "new-token",
  args: [
    { name: "variable", type: "any", skipInterpret: true },
    { name: "name", type: "string" },
    { name: "symbol", type: "string" },
    { name: "controller", type: "address" },
    { name: "decimals", type: "number", optional: true },
    { name: "transferable", type: "bool", optional: true },
  ],
  async run(
    module,
    { name, symbol, controller, decimals = 18, transferable = true },
    { node },
  ) {
    const varNode = node.args[0];
    if (varNode.type !== NodeType.VariableIdentifier) {
      throw new ErrorException(
        "first argument must be a $variable to store the token address",
      );
    }
    const varName = varNode.value;

    const chainId = await module.getChainId();

    if (!MINIME_TOKEN_FACTORIES.has(chainId)) {
      throw new ErrorException(
        `no MiniMeTokenFactory was found on chain ${chainId}`,
      );
    }

    const factoryAddr = MINIME_TOKEN_FACTORIES.get(chainId)!;
    const nonce = await buildNonceForAddress(
      factoryAddr,
      await module.incrementNonce(factoryAddr),
      await module.getClient(),
    );
    const newTokenAddress = getContractAddress({
      from: factoryAddr,
      nonce,
    });

    module.bindingsManager.setBinding(
      varName,
      newTokenAddress,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );

    return [
      encodeAction(
        factoryAddr,
        "createCloneToken(address,uint,string,uint8,string,bool)",
        [zeroAddress, 0, name, decimals, symbol, transferable],
      ),
      encodeAction(newTokenAddress, "changeController(address)", [controller]),
    ];
  },
  buildCompletionItemsForArg() {
    return [];
  },
  async runEagerExecution() {
    return;
  },
});

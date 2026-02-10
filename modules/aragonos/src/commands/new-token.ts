import type { Address } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  encodeAction,
} from "@evmcrispr/sdk";
import { getContractAddress, isAddress, zeroAddress } from "viem";
import type AragonOS from "..";
import {
  buildNonceForAddress,
  getDaoAddrFromIdentifier,
  isLabeledAppIdentifier,
  MINIME_TOKEN_FACTORIES,
} from "../utils";

export default defineCommand<AragonOS>({
  name: "new-token",
  args: [
    { name: "name", type: "string" },
    { name: "symbol", type: "string" },
    { name: "controller", type: "any" },
    { name: "decimals", type: "number", optional: true },
    { name: "transferable", type: "bool", optional: true },
  ],
  async run(
    module,
    { name, symbol, controller, decimals = 18, transferable = true },
    { node },
  ) {
    const chainId = await module.getChainId();

    if (!MINIME_TOKEN_FACTORIES.has(chainId)) {
      throw new ErrorException(
        `no MiniMeTokenFactory was found on chain ${chainId}`,
      );
    }

    let controllerAddress: Address;

    const identifierBinding = module.bindingsManager.getBindingValue(
      controller,
      BindingsSpace.ADDR,
    );

    if (isAddress(controller)) {
      controllerAddress = controller;
    } else if (identifierBinding) {
      controllerAddress = identifierBinding;
    } else if (isLabeledAppIdentifier(controller) && module.currentDAO) {
      const kernel =
        getDaoAddrFromIdentifier(node.args[2].value, module.bindingsManager) ||
        module.currentDAO?.kernel.address;
      controllerAddress = await module.registerNextProxyAddress(
        controller,
        kernel,
      );
    } else if (isLabeledAppIdentifier(controller) && !module.currentDAO) {
      throw new ErrorException(
        `invalid controller. Expected a labeled app identifier witin a connect command for ${controller}`,
      );
    } else {
      throw new ErrorException(
        `invalid controller. Expected an address or an app identifier, but got ${controller}`,
      );
    }

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
      `token:${symbol}`,
      newTokenAddress,
      BindingsSpace.ADDR,
    );

    return [
      encodeAction(
        factoryAddr,
        "createCloneToken(address,uint,string,uint8,string,bool)",
        [zeroAddress, 0, name, decimals, symbol, transferable],
      ),
      encodeAction(newTokenAddress, "changeController(address)", [
        controllerAddress,
      ]),
    ];
  },
  buildCompletionItemsForArg() {
    return [];
  },
  async runEagerExecution() {
    return;
  },
});

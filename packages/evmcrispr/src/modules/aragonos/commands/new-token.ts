import { getContractAddress, isAddress, zeroAddress } from "viem";

import {
  ComparisonType,
  checkArgsLength,
  encodeAction,
  isNumberish,
} from "../../../utils";
import {
  MINIME_TOKEN_FACTORIES,
  buildNonceForAddress,
  getDaoAddrFromIdentifier,
  isLabeledAppIdentifier,
} from "../utils";
import { ErrorException } from "../../../errors";
import type { Address, ICommand } from "../../../types";
import { BindingsSpace } from "../../../types";
import type { AragonOS } from "../AragonOS";

export const newToken: ICommand<AragonOS> = {
  async run(module, c, { interpretNodes }) {
    const chainId = await module.getChainId();

    if (!MINIME_TOKEN_FACTORIES.has(chainId)) {
      throw new ErrorException(
        `no MiniMeTokenFactory was found on chain ${chainId}`,
      );
    }

    checkArgsLength(c, {
      type: ComparisonType.Between,
      minValue: 3,
      maxValue: 5,
    });

    const [name, symbol, controller, decimals = 18, transferable = true] =
      await interpretNodes(c.args);

    if (!isNumberish(decimals)) {
      throw new ErrorException(
        `invalid decimals. Expected an integer number, but got ${decimals.toString()}`,
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
        getDaoAddrFromIdentifier(c.args[2].value, module.bindingsManager) ||
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

    if (
      typeof transferable !== "boolean" &&
      transferable !== "true" &&
      transferable !== "false"
    ) {
      throw new ErrorException(
        `invalid transferable flag. Expected a boolean, but got ${transferable}`,
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
};

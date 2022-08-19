import { BigNumber, constants, utils } from 'ethers';

import type { Address } from '../../../..';

import {
  buildNonceForAddress,
  calculateNewProxyAddress,
  isAppIdentifier,
  isLabeledAppIdentifier,
} from '../../../../utils';
import { BindingsSpace } from '../../../interpreter/BindingsManager';

import { Interpreter } from '../../../interpreter/Interpreter';
import type { CommandFunction } from '../../../types';
import { ComparisonType, checkArgsLength, checkOpts } from '../../../utils';
import type { AragonOS } from '../AragonOS';
import {
  CONTROLLED_INTERFACE,
  MINIME_TOKEN_FACTORIES,
  MINIME_TOKEN_FACTORY_INTERFACE,
} from '../utils';
import { DAO_OPT_NAME, getDAOByOption } from '../utils/commands';

export const newToken: CommandFunction<AragonOS> = async (
  module,
  c,
  { interpretNode, interpretNodes },
) => {
  const chainId = await module.signer.getChainId();

  if (!MINIME_TOKEN_FACTORIES.has(chainId)) {
    Interpreter.panic(c, `no MiniMeTokenFactory was found on chain ${chainId}`);
  }

  checkArgsLength(c, {
    type: ComparisonType.Between,
    minValue: 3,
    maxValue: 5,
  });
  checkOpts(c, [DAO_OPT_NAME]);

  const dao = await getDAOByOption(module, c, interpretNode);

  const [name, symbol, controller, decimals = 18, transferable = true] =
    await interpretNodes(c.args);

  if (!BigNumber.isBigNumber(decimals) && !Number.isInteger(decimals)) {
    Interpreter.panic(
      c,
      `invalid decimals. Expected an integer number, but got ${decimals.toString()}`,
    );
  }

  let controllerAdddress: Address;

  if (!utils.isAddress(controller)) {
    if (isAppIdentifier(controller) || isLabeledAppIdentifier(controller)) {
      await module.registerNextProxyAddress(controller, dao.kernel.address);
    } else {
      Interpreter.panic(
        c,
        `invalid controller. Expected an address or an app identifier, but got ${controller}`,
      );
    }
    controllerAdddress = module.bindingsManager.getBinding(
      controller,
      BindingsSpace.ADDR,
    );
  } else {
    controllerAdddress = controller;
  }

  if (
    typeof transferable !== 'boolean' &&
    transferable !== 'true' &&
    transferable !== 'false'
  ) {
    Interpreter.panic(
      c,
      `invalid transferable flag. Expected a boolean, but got ${transferable}`,
    );
  }

  if (!MINIME_TOKEN_FACTORIES.has(chainId)) {
    Interpreter.panic(c, `no MiniMeTokenFactory was found on chain ${chainId}`);
  }

  const factoryAddr = MINIME_TOKEN_FACTORIES.get(chainId)!;
  const nonce = await buildNonceForAddress(
    factoryAddr,
    module.incrementNonce(factoryAddr),
    module.signer.provider!,
  );
  const newTokenAddress = calculateNewProxyAddress(factoryAddr, nonce);

  module.bindingsManager.setBinding(
    `token:${symbol}`,
    newTokenAddress,
    BindingsSpace.ADDR,
  );

  return [
    {
      to: factoryAddr,
      data: MINIME_TOKEN_FACTORY_INTERFACE.encodeFunctionData(
        'createCloneToken',
        [constants.AddressZero, 0, name, decimals, symbol, transferable],
      ),
    },
    {
      to: newTokenAddress,
      data: CONTROLLED_INTERFACE.encodeFunctionData('changeController', [
        controllerAdddress,
      ]),
    },
  ];
};

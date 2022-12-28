import { ErrorInvalid, erc20ABI } from '@1hive/evmcrispr';
import type { Action, Module, TransactionAction } from '@1hive/evmcrispr';

import { Contract, constants, utils } from 'ethers';
import type { BigNumber } from 'ethers';

import { encodeActCall, encodeCallScript } from './aragonos-forwaders';

export const FORWARDER_TYPES = {
  NOT_IMPLEMENTED: 0,
  NO_CONTEXT: 1,
  WITH_CONTEXT: 2,
};

export const isForwarder = async (forwarder: Contract): Promise<boolean> => {
  try {
    return await forwarder.isForwarder();
  } catch (err) {
    return false;
  }
};

export const getForwarderFee = async (
  forwarder: Contract,
): Promise<[string, BigNumber] | undefined> => {
  // If it fails we assume app is not a payable forwarder
  try {
    return await forwarder.forwardFee();
  } catch (err) {
    return;
  }
};

export const getForwarderType = async (
  forwarder: Contract,
): Promise<number> => {
  // If it fails then we assume app implements an aragonos older version forwarder
  try {
    return await forwarder.forwarderType();
  } catch (err) {
    return FORWARDER_TYPES.NO_CONTEXT;
  }
};

export const forwarderABI = [
  'function forward(bytes evmCallScript) public',
  'function isForwarder() external pure returns (bool)',
  'function canForward(address sender, bytes evmCallScript) public view returns (bool)',
  'function forwardFee() external view returns (address, uint256)',
  'function forwarderType() external pure returns (uint8)',
];

export const batchForwarderActions = async (
  module: Module,
  forwarderActions: TransactionAction[],
  forwarders: string[],
  context?: string,
): Promise<Action[]> => {
  let script: string;
  let value: string | number = 0;
  const actions: Action[] = [];

  for (const forwarderAddress of forwarders) {
    script = encodeCallScript(forwarderActions);
    const forwarder = new Contract(
      forwarderAddress,
      forwarderABI,
      await module.getProvider(),
    );

    if (!(await isForwarder(forwarder))) {
      throw new ErrorInvalid(`app ${forwarder.address} is not a forwarder`);
    }

    const fee = await getForwarderFee(forwarder);

    if (fee) {
      const [feeTokenAddress, feeAmount] = fee;

      // Check if fees are in ETH
      if (feeTokenAddress === constants.AddressZero) {
        value = feeAmount.toNumber();
      } else {
        const feeToken = new Contract(
          feeTokenAddress,
          erc20ABI,
          await module.getProvider(),
        );
        const allowance = (await feeToken.allowance(
          await module.getConnectedAccount(),
          forwarderAddress,
        )) as BigNumber;

        if (allowance.gt(0) && allowance.lt(feeAmount)) {
          actions.push({
            to: feeTokenAddress,
            data: feeToken.interface.encodeFunctionData('approve', [
              forwarderAddress,
              0,
            ]),
          });
        }
        if (allowance.eq(0)) {
          actions.push({
            to: feeTokenAddress,
            data: feeToken.interface.encodeFunctionData('approve', [
              forwarderAddress,
              feeAmount,
            ]),
          });
        }
      }
    }

    if ((await getForwarderType(forwarder)) === FORWARDER_TYPES.WITH_CONTEXT) {
      if (!context) {
        throw new ErrorInvalid(`context option missing`);
      }
      forwarderActions = [
        {
          to: forwarderAddress,
          data: encodeActCall('forward(bytes,bytes)', [
            script,
            utils.hexlify(utils.toUtf8Bytes(context)),
          ]),
        },
      ];
    } else {
      forwarderActions = [
        {
          to: forwarderAddress,
          data: encodeActCall('forward(bytes)', [script]),
        },
      ];
    }
  }
  if (value) {
    forwarderActions[forwarderActions.length - 1].value = value;
  }
  return [...actions, ...forwarderActions];
};

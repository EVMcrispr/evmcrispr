import type { BigNumber, Contract } from 'ethers';

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

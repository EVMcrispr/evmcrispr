import { Contract, BigNumber } from "ethers";
import { forwarderAbi, forwarderFeeAbi } from "@1hive/connect-core";

export const FORWARDER_ABI = [
  ...forwarderAbi,
  ...forwarderFeeAbi,
  // Function missing on Connect's forwarder abi
  "function forwarderType() external pure returns (uint8)",
];

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

export const getForwarderFee = async (forwarder: Contract): Promise<[string, BigNumber]> => {
  // If it fails we assume app is not a payable forwarder
  try {
    return await forwarder.forwardFee();
  } catch (err) {
    return null;
  }
};

export const getForwarderType = async (forwarder: Contract): Promise<number> => {
  // If it fails then we assume app implements an aragonos older version forwarder
  try {
    return await forwarder.forwarderType();
  } catch (err) {
    return FORWARDER_TYPES.NO_CONTEXT;
  }
};

import { ethers } from "hardhat";
import { BigNumber, Signer } from "ethers";
import { IAbstractForwarder, IForwarderFee } from "../../typechain";

export const FORWARDER_TYPES = {
  NOT_IMPLEMENTED: 0,
  NO_CONTEXT: 1,
  WITH_CONTEXT: 2,
};

export const getForwarderFee = async (
  appAddress: string
): Promise<[string, BigNumber] & { feeToken: string; feeAmount: BigNumber }> => {
  const forwarderFee = (await ethers.getContractAt("IForwarderFee", appAddress)) as IForwarderFee;
  try {
    return forwarderFee.forwardFee();
  } catch (err) {
    return null;
  }
};

export const getForwarderType = async (appAddress: string, signer: Signer): Promise<number> => {
  const forwarderContract = (await ethers.getContractAt("IAbstractForwarder", appAddress)) as IAbstractForwarder;
  const isForwarder = await forwarderContract.isForwarder();

  if (!isForwarder) {
    throw new Error(`App ${appAddress} is not a forwarder`);
  }

  // If it fails then app implements an aragonos older-version forwarder
  try {
    const type = await forwarderContract.forwarderType();
    return type;
  } catch (err) {
    return 1;
  }
};

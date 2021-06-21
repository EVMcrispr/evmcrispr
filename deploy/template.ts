import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { Config } from "../helpers/configuration";

const { AragonID, DAOFactory, ENS, MiniMeFactory } = Config.Bases["xdai"];

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("", {
    from: deployer,
    args: [DAOFactory, ENS, MiniMeFactory, AragonID],
    log: true,
    deterministicDeployment: true,
  });
};
export default func;

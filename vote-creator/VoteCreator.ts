import { ethers } from "hardhat";
import { BigNumber, providers, Signer, utils } from "ethers";
import { connect, Organization, Address, encodeCallScript, App, GraphQLWrapper } from "@1hive/connect";
import {
  FORWARDER_TYPES,
  getForwarderFee,
  getForwarderType,
  encodeActCall,
  ZERO_ADDRESS,
  TX_GAS_LIMIT,
  TX_GAS_PRICE,
  getAppRepoData,
  getAppArtifact,
  subgraphUrlFromChainId,
  normalizeRole,
} from "./helpers";
import { CallScriptAction, Permission } from "./types";
import { ERC20 } from "../typechain";

const IPFS_URI = "https://ipfs.eth.aragon.network/ipfs/{cid}{path}";
const { WITH_CONTEXT } = FORWARDER_TYPES;

export default class VoteCreator {
  #dao: Organization;
  #gql: GraphQLWrapper;
  #signer: Signer;

  constructor(signer: Signer) {
    this.#signer = signer;
  }

  async connect(daoAddress) {
    const chainId = await this.#signer.getChainId();

    this.#dao = await connect(daoAddress, "thegraph", {
      actAs: await this.#signer.getAddress(),
      network: chainId,
      ipfs: IPFS_URI,
    });
    this.#gql = new GraphQLWrapper(subgraphUrlFromChainId(chainId));
  }

  get dao(): Organization {
    return this.#dao;
  }

  get gql(): GraphQLWrapper {
    return this.#gql;
  }

  async app(name) {
    return ((await this.dao.app(name)) as App).address as Address;
  }

  async calculateForwardScript(
    path: Address[],
    method: string,
    params: any[],
    context?: string
  ): Promise<CallScriptAction> {
    // Need to build the evmscript starting from the last forwarder
    const forwarders = [...path].reverse();
    const targetApp = forwarders.shift();

    let script: string;
    let action: CallScriptAction = { to: targetApp, data: encodeActCall(method, params) };
    let value = BigNumber.from(0);

    for (let i = 0; i < forwarders.length; i++) {
      script = encodeCallScript([action]);
      const forwarder = forwarders[i];
      const fee = await getForwarderFee(forwarder);

      if (fee) {
        const { feeToken, feeAmount } = fee;

        // Check if fees are in ETH
        if (feeToken === ZERO_ADDRESS) {
          value = feeAmount;
        } else {
          const token = (await ethers.getContractAt("ERC20", feeToken, this.#signer)) as ERC20;
          const allowance = await token.allowance(await this.#signer.getAddress(), forwarder);

          if (allowance.gt(BigNumber.from(0)) && allowance.lt(feeAmount)) {
            await (await token.approve(forwarder, 0)).wait();
          }
          if (allowance.eq(BigNumber.from(0))) {
            await (await token.approve(forwarder, feeAmount)).wait();
          }
        }
      }

      if ((await getForwarderType(forwarder, this.#signer)) === WITH_CONTEXT) {
        const data = encodeActCall("forward(bytes,bytes)", [script, context]);
        action = { to: forwarder, data };
      } else {
        const data = encodeActCall("forward(bytes)", [script]);
        action = { to: forwarder, data };
      }
    }

    return { ...action, value };
  }

  async forward(action: CallScriptAction): Promise<providers.TransactionReceipt> {
    return await (
      await this.#signer.sendTransaction({
        ...action,
        gasLimit: TX_GAS_LIMIT,
      })
    ).wait();
  }

  async installNewApp(appName: string, registryName: string, appInitArguments: any[] = []) {
    try {
      const kernel = await this.#dao.kernel();
      const appRepo = await getAppRepoData(this.#gql, appName, registryName);
      const appArtifact = await getAppArtifact(this.#dao, appRepo.lastVersion.contentUri);
      const abiInterface = new utils.Interface(appArtifact.abi);
      const encodedInitializeFunc = abiInterface.encodeFunctionData("initialize", appInitArguments);
      const appId = utils.namehash(appArtifact.appName);

      const path = await kernel.intent(
        "newAppInstance",
        [appId, appRepo.lastVersion.codeAddress, encodedInitializeFunc, false],
        {
          actAs: await this.#signer.getAddress(),
        }
      );

      if (!path.transactions.length) {
        throw new Error("No transaction path found");
      }

      let txReceipt: providers.TransactionReceipt;
      for (let i = 0; i < path.transactions.length; i++) {
        txReceipt = await (
          await this.#signer.sendTransaction({
            ...path.transactions[i],
            gasLimit: TX_GAS_LIMIT,
            gasPrice: TX_GAS_PRICE,
          })
        ).wait();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async createPermissions(permissionTable: Permission[]) {
    const encodedPermissions = [];
    const acl = await this.#dao.acl();
    const aclAbi = new utils.Interface(acl.abi);

    for (let i = 0; i < permissionTable.length; i++) {
      const { appAddress, role, granteeAddress, managerAddress } = permissionTable[i];
      encodedPermissions.push(
        aclAbi.encodeFunctionData("createPermission", [granteeAddress, appAddress, normalizeRole(role), managerAddress])
      );
    }
  }
}

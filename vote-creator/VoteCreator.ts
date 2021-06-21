import { ethers } from "hardhat";
import { BigNumber, ContractReceipt, providers, Signer, utils } from "ethers";
import { connect, Organization, Address, encodeCallScript, App, GraphQLWrapper } from "@1hive/connect";
import ora from "ora";
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
import { Permission } from "./types";
import { ERC20 } from "../typechain";

const { WITH_CONTEXT } = FORWARDER_TYPES;

let spinner = ora();

export default class VoteCreator {
  #dao: Organization;
  #gql: GraphQLWrapper;
  #signer: Signer;

  constructor(signer: Signer) {
    this.#signer = signer;
  }

  async initialize(daoAddress) {
    const chainId = await this.#signer.getChainId();

    this.#dao = await connect(daoAddress, "thegraph", {
      actAs: await this.#signer.getAddress(),
      network: chainId,
      ipfs: "https://ipfs.eth.aragon.network/ipfs/{cid}{path}",
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

  async forward(path: Address[], method: string, params: any[], context?: string) {
    // Need to build the evmscript starting from the last forwarder
    const forwarders = [...path].reverse();
    const firstForwarder = forwarders.pop();
    const targetApp = forwarders.shift();

    let forwarderScript: string;
    let txReceipt: ContractReceipt;
    let txValue = BigNumber.from(0);

    forwarderScript = encodeCallScript([{ to: targetApp, data: encodeActCall(method, params) }]);

    for (let i = 0; i < forwarders.length; i++) {
      const forwarder = forwarders[i];
      const fee = await getForwarderFee(forwarder);

      if (fee) {
        const { feeToken, feeAmount } = fee;
        if (feeToken === ZERO_ADDRESS) {
          txValue = feeAmount;
        } else {
          const token = (await ethers.getContractAt("ERC20", feeToken, this.#signer)) as ERC20;
          const allowance = await token.allowance(await this.#signer.getAddress(), forwarder);
          if (allowance.gt(BigNumber.from(0)) && allowance.lt(feeAmount)) {
            await token.approve(forwarder, 0);
          }
          await token.approve(forwarder, feeToken);
        }
      }

      if ((await getForwarderType(forwarder, this.#signer)) === WITH_CONTEXT) {
        const data = encodeActCall("forward(bytes,bytes)", [forwarderScript, context]);
        forwarderScript = encodeCallScript([{ to: forwarder, data }]);
      } else {
        const data = encodeActCall("forward(bytes)", [forwarderScript]);
        forwarderScript = encodeCallScript([{ to: forwarder, data }]);
      }
    }

    if ((await getForwarderType(firstForwarder, this.#signer)) === WITH_CONTEXT) {
      txReceipt = await (
        await this.#signer.sendTransaction({
          to: firstForwarder,
          data: encodeActCall("forward(bytes,bytes)", [forwarderScript, context]),
          gasLimit: TX_GAS_LIMIT,
          value: txValue,
        })
      ).wait();
      console.log(txReceipt);
    } else {
      txReceipt = await (
        await this.#signer.sendTransaction({
          to: firstForwarder,
          data: encodeActCall("forward(bytes)", [forwarderScript]),
          gasLimit: TX_GAS_LIMIT,
          value: txValue,
        })
      ).wait();
      console.log(txReceipt);
    }
  }

  async installNewApp(appName: string, registryName: string, appInitArguments: any[] = []) {
    try {
      const prefixMessage = `Installing ${appName} app:`;
      const kernel = await this.#dao.kernel();

      spinner.start(`${prefixMessage} Fetching app repo`);

      const appRepo = await getAppRepoData(this.#gql, appName, registryName);
      const appArtifact = await getAppArtifact(this.#dao, appRepo.lastVersion.contentUri);
      const abiInterface = new utils.Interface(appArtifact.abi);
      const encodedInitializeFunc = abiInterface.encodeFunctionData("initialize", appInitArguments);
      const appId = utils.namehash(appArtifact.appName);

      spinner.start(`${prefixMessage} Calculating transaction path`);

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

      console.log(path.transactions);
      let txReceipt: providers.TransactionReceipt;
      for (let i = 0; i < path.transactions.length; i++) {
        spinner = spinner.start(`${prefixMessage} Executing tx ${i + 1} of ${path.transactions.length}`);

        txReceipt = await (
          await this.#signer.sendTransaction({
            ...path.transactions[i],
            gasLimit: TX_GAS_LIMIT,
            gasPrice: TX_GAS_PRICE,
          })
        ).wait();
        spinner = spinner.succeed(
          `${prefixMessage} tx ${i + 1} of ${path.transactions.length} executed. Tx hash: ${txReceipt.transactionHash}`
        );
      }

      spinner.succeed(`App ${appName} installed!`);
    } catch (err) {
      spinner.fail();
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

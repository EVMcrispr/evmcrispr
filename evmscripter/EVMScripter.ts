import { ethers } from "hardhat";
import { BigNumber, providers, Signer, utils } from "ethers";
import { connect, Organization, Address, encodeCallScript, App as ConnectApp, GraphQLWrapper } from "@1hive/connect";
import {
  FORWARDER_TYPES,
  getForwarderFee,
  getForwarderType,
  encodeActCall,
  ZERO_ADDRESS,
  TX_GAS_LIMIT,
  TX_GAS_PRICE,
  subgraphUrlFromChainId,
  parseAppIdentifier,
  SEPARATOR,
  getAppRepoData,
  getAppArtifact,
  buildNonceForAddress,
  calculateNewProxyAddress,
} from "./helpers";
import {
  App,
  Action,
  AppIdentifier,
  AppCache,
  Entity,
  LabeledAppIdentifier,
  ForwardOptions,
  CounterfactualAppCache,
} from "./types";
import { ERC20 } from "../typechain";
import { Interface } from "@ethersproject/abi";
import { ErrorAppNotFound, ErrorException, ErrorMethodNotFound } from "./errors";

const IPFS_URI_TEMPLATE = "https://ipfs.eth.aragon.network/ipfs/{cid}{path}";
const { WITH_CONTEXT } = FORWARDER_TYPES;

const buildAppsCache = (apps: ConnectApp[]): AppCache => {
  const appCache = new Map();
  const appCounter = new Map();

  for (const app of apps) {
    const { name } = app;
    const counter = appCounter.has(name) ? appCounter.get(name) : 0;
    appCounter.set(name, counter + 1);

    appCache.set(`${name}:${counter}`, { ...app, abiInterface: new Interface(app.abi) });
  }

  return appCache;
};

export default class EVMScripter {
  #dao: Organization;
  #appsCache: AppCache;
  #counterfactualApps: CounterfactualAppCache;
  #gql: GraphQLWrapper;
  #signer: Signer;

  ANY_ENTITY = "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF";

  constructor(signer: Signer) {
    this.#signer = signer;
  }

  async connect(daoAddress) {
    const chainId = await this.#signer.getChainId();

    this.#dao = await connect(daoAddress, "thegraph", {
      actAs: await this.#signer.getAddress(),
      network: chainId,
      ipfs: {
        urlTemplate: IPFS_URI_TEMPLATE,
        cache: 0,
      },
    });
    this.#gql = new GraphQLWrapper(subgraphUrlFromChainId(chainId));
    this.#counterfactualApps = new Map();

    const apps = await this.#dao.apps();
    // Cache all dao apps
    this.#appsCache = buildAppsCache(apps);
  }

  app(appIdentifier: AppIdentifier | LabeledAppIdentifier): Address {
    if (this.#counterfactualApps.has(appIdentifier)) {
      return this.#counterfactualApps.get(appIdentifier);
    }
    return this._resolveApp(appIdentifier).address;
  }

  async encode(actions: Action[], options: ForwardOptions): Promise<Action> {
    // Need to build the evmscript starting from the last forwarder
    const forwarders = options.path.map((entity) => this._resolveEntity(entity)).reverse();

    let script: string;
    let forwarderActions = [...actions];
    let value = BigNumber.from(0);

    for (let i = 0; i < forwarders.length; i++) {
      script = encodeCallScript(forwarderActions);
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
        forwarderActions = [{ to: forwarder, data }];
      } else {
        const data = encodeActCall("forward(bytes)", [script]);
        forwarderActions = [{ to: forwarder, data }];
      }
    }

    return { ...forwarderActions[0], value };
  }

  async installNewApp(
    app: LabeledAppIdentifier,
    registryName: string = "aragonpm.eth",
    initParams: any[] = []
  ): Promise<Action> {
    const kernel = this._resolveApp("kernel");
    const [appName] = parseAppIdentifier(app).split(SEPARATOR);
    const appRepo = await getAppRepoData(this.#gql, appName, registryName);
    const appArtifact = await getAppArtifact(this.#dao, appRepo.lastVersion.contentUri);
    const abiInterface = new utils.Interface(appArtifact.abi);
    const encodedInitializeFunc = abiInterface.encodeFunctionData("initialize", initParams);
    const appId = utils.namehash(appArtifact.appName);

    const nonce = await buildNonceForAddress(
      kernel.address,
      this.#counterfactualApps.size,
      this.#dao.connection.ethersProvider
    );
    const proxyContractAddress = calculateNewProxyAddress(kernel.address, nonce);

    if (this.#counterfactualApps.has(app)) {
      throw new ErrorException(`Label ${app} is already in use`);
    }
    this.#counterfactualApps.set(app, proxyContractAddress);

    return {
      to: kernel.address,
      data: kernel.abiInterface.encodeFunctionData("newAppInstance(bytes32,address,bytes,bool)", [
        appId,
        appRepo.lastVersion.codeAddress,
        encodedInitializeFunc,
        false,
      ]),
    };
  }

  async forward(actions: Action[], options: ForwardOptions): Promise<providers.TransactionReceipt> {
    const forwarderAction = await this.encode(actions, options);

    return await (
      await this.#signer.sendTransaction({
        ...forwarderAction,
        gasLimit: TX_GAS_LIMIT,
        gasPrice: TX_GAS_PRICE,
      })
    ).wait();
  }

  private _resolveApp(appIdentifier: AppIdentifier): App {
    const parsedIdentifier = parseAppIdentifier(appIdentifier);
    if (!this.#appsCache.has(parsedIdentifier)) {
      throw new ErrorAppNotFound(appIdentifier);
    }
    return this.#appsCache.get(parsedIdentifier);
  }

  private _resolveEntity(entity: Entity): Address {
    return ethers.utils.isAddress(entity) ? entity : this.app(entity);
  }
}

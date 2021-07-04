import { ethers } from "hardhat";
import { BigNumber, providers, Signer, utils } from "ethers";
import {
  App as ConnectApp,
  connect,
  Organization,
  Address,
  encodeCallScript,
  GraphQLWrapper,
  ErrorNotFound,
} from "@1hive/connect";
import {
  FORWARDER_TYPES,
  getForwarderFee,
  getForwarderType,
  encodeActCall,
  ZERO_ADDRESS,
  TX_GAS_LIMIT,
  TX_GAS_PRICE,
  subgraphUrlFromChainId,
  parseLabeledIdentifier,
  SEPARATOR,
  getAppRepoData,
  getAppArtifact,
  buildNonceForAddress,
  calculateNewProxyAddress,
  getAppRolesData,
  parseAppIdentifier,
  IPFS_URI_TEMPLATE,
  prepareAppRoles,
  normalizeActions,
  normalizeRole,
} from "./helpers";
import {
  Action,
  AppIdentifier,
  AppCache,
  AppInterfaceCache,
  Entity,
  LabeledAppIdentifier,
  ForwardOptions,
  Permission,
  App,
  RawAction,
} from "./types";
import { ERC20 } from "../typechain";
import { ErrorAppNotFound, ErrorException, ErrorInvalidIdentifier, ErrorMethodNotFound } from "./errors";

const { WITH_CONTEXT } = FORWARDER_TYPES;

export default class EVMScripter {
  #dao: Organization;
  #appCache: AppCache;
  #appInterfaceCache: AppInterfaceCache;
  #installedAppCounter: number;
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
    this.#installedAppCounter = 0;

    const [appCache, appResourcesCache] = await this._buildCaches(await this.#dao.apps());
    this.#appCache = appCache;
    this.#appInterfaceCache = appResourcesCache;
  }

  call(appIdentifier: AppIdentifier): any {
    return new Proxy(this._resolveApp(appIdentifier), {
      get: (targetApp, functionProperty: string) => {
        return (...params: any): Action => {
          try {
            return {
              to: targetApp.address,
              data: targetApp.abiInterface.encodeFunctionData(functionProperty, params),
            };
          } catch (err) {
            throw new ErrorMethodNotFound(functionProperty, targetApp.name);
          }
        };
      },
    });
  }

  app(appIdentifier: AppIdentifier | LabeledAppIdentifier): Address {
    return this._resolveApp(appIdentifier).address;
  }

  async encode(rawActions: RawAction[], options: ForwardOptions): Promise<Action> {
    const actions = await normalizeActions(rawActions);
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
    registryName = "aragonpm.eth",
    initParams: any[] = []
  ): Promise<Action> {
    const [appName, label] = parseLabeledIdentifier(app).split(SEPARATOR);
    const appRepo = await getAppRepoData(this.#gql, appName, registryName);
    const { codeAddress, contentUri, artifact } = appRepo.lastVersion;
    const appArtifact = JSON.parse(artifact) ?? (await getAppArtifact(this.#dao, contentUri));
    const kernel = this._resolveApp("kernel");
    const abiInterface = new utils.Interface(appArtifact.abi);
    const encodedInitializeFunc = abiInterface.encodeFunctionData("initialize", initParams);
    const appId = utils.namehash(appArtifact.appName);

    const nonce = await buildNonceForAddress(
      kernel.address,
      this.#installedAppCounter,
      this.#dao.connection.ethersProvider
    );
    const proxyContractAddress = calculateNewProxyAddress(kernel.address, nonce);

    if (this.#appCache.has(label)) {
      throw new ErrorException(`Label ${app} is already in use`);
    }

    if (!this.#appInterfaceCache.has(codeAddress)) {
      this.#appInterfaceCache.set(codeAddress, abiInterface);
    }

    this.#appCache.set(app, {
      address: proxyContractAddress,
      codeAddress,
      appId,
      // Set a reference to the app interface
      abiInterface: this.#appInterfaceCache.get(codeAddress),
      permissions: appArtifact.roles.reduce((permissionsMap, role) => {
        permissionsMap.set(role.bytes, { manager: null, grantees: [] });
      }, new Map()),
    } as App);

    this.#installedAppCounter++;

    return {
      to: kernel.address,
      data: kernel.abiInterface.encodeFunctionData("newAppInstance(bytes32,address,bytes,bool)", [
        appId,
        codeAddress,
        encodedInitializeFunc,
        false,
      ]),
    };
  }

  async forward(actions: RawAction[], options: ForwardOptions): Promise<providers.TransactionReceipt> {
    const forwarderAction = await this.encode(actions, options);
    const receipt = await (
      await this.#signer.sendTransaction({
        ...forwarderAction,
        gasLimit: TX_GAS_LIMIT,
        gasPrice: TX_GAS_PRICE,
      })
    ).wait();

    return receipt;
  }

  addPermission(permission: Permission, defaultPermissionManager: Entity): Action {
    const [grantee, app, role] = permission;
    const [granteeAddress, appAddress, roleHash] = this._resolvePermission(permission);
    const manager = this._resolveEntity(defaultPermissionManager);
    const { permissions: appPermissions } = this._resolveApp(app);
    const { address: aclAddress, abiInterface: aclAbiInterface } = this._resolveApp("acl");

    if (!appPermissions.has(roleHash)) {
      throw new ErrorNotFound(`Permission ${role} doesn't exists in app ${app}`);
    }

    const appPermission = appPermissions.get(roleHash);
    if (!appPermission.grantees.size) {
      appPermission.manager = manager;
      appPermission.grantees.add(granteeAddress);

      return {
        to: aclAddress,
        data: aclAbiInterface.encodeFunctionData("createPermission", [granteeAddress, appAddress, roleHash, manager]),
      };
    } else {
      if (appPermission.grantees.has(granteeAddress)) {
        throw new ErrorException(`Grantee ${grantee} already has permission ${role}`);
      }
      appPermission.grantees.add(granteeAddress);

      return {
        to: aclAddress,
        data: aclAbiInterface.encodeFunctionData("grantPermission", [granteeAddress, appAddress, roleHash]),
      };
    }
  }

  addPermissions(permissions: Permission[], defaultPermissionManager: Entity): Action[] {
    return permissions.map((p) => this.addPermission(p, defaultPermissionManager));
  }

  revokePermission(permission: Permission, removeManager = true): Action[] {
    const [_, app, role] = permission;
    const [entityAddress, appAddress, roleHash] = this._resolvePermission(permission);
    const { permissions: appPermissions } = this._resolveApp(app);
    const { address: aclAddress, abiInterface: aclAbiInterface } = this._resolveApp("acl");

    if (!appPermissions.has(roleHash)) {
      throw new ErrorNotFound(`Permission ${role} doesn't exists in app ${app}`);
    }

    const revokeAction = {
      to: aclAddress,
      data: aclAbiInterface.encodeFunctionData("revokePermission", [entityAddress, appAddress, roleHash]),
    };

    return [
      revokeAction,
      removeManager
        ? {
            to: aclAddress,
            data: aclAbiInterface.encodeFunctionData("removePermissionManager", [appAddress, roleHash]),
          }
        : null,
    ];
  }

  revokePermissions(permissions: Permission[], removeManager = true): Action[] {
    return permissions.reduce((actions, permission) => {
      const action = this.revokePermission(permission, removeManager);
      return [...actions, ...action];
    }, []);
  }

  private _resolveApp(appIdentifier: AppIdentifier | LabeledAppIdentifier): App {
    const parsedIdentifier = parseAppIdentifier(appIdentifier) ?? parseLabeledIdentifier(appIdentifier);
    if (!parsedIdentifier) {
      throw new ErrorInvalidIdentifier(appIdentifier);
    }
    if (!this.#appCache.has(parsedIdentifier)) {
      throw new ErrorAppNotFound(appIdentifier);
    }

    return this.#appCache.get(parsedIdentifier);
  }

  private _resolveEntity(entity: Entity): Address {
    return ethers.utils.isAddress(entity) ? entity : this.app(entity);
  }

  private _resolvePermission(permission: Permission): Entity[] {
    return permission.map((entity, index) =>
      index < permission.length - 1 ? this._resolveEntity(entity) : normalizeRole(entity)
    );
  }

  private _buildCaches = async (apps: ConnectApp[]): Promise<[AppCache, AppInterfaceCache]> => {
    const appCache: AppCache = new Map();
    const appInterfaceCache: AppInterfaceCache = new Map();
    const appCounter = new Map();

    for (const app of apps) {
      const { address, name, codeAddress, contentUri, artifact } = app;
      const appArtifact = artifact ?? (await getAppArtifact(this.#dao, contentUri));
      const appCurrentPermisisons = await getAppRolesData(this.#gql, address);
      const counter = appCounter.has(name) ? appCounter.get(name) : 0;

      if (!appInterfaceCache.has(codeAddress)) {
        appInterfaceCache.set(codeAddress, app.ethersInterface());
      }

      appCache.set(`${name}:${counter}`, {
        ...app,
        // Set reference to app interface
        abiInterface: appInterfaceCache.get(codeAddress),
        permissions: prepareAppRoles(appCurrentPermisisons, appArtifact),
      } as App);
      appCounter.set(name, counter + 1);
    }

    return [appCache, appInterfaceCache];
  };
}

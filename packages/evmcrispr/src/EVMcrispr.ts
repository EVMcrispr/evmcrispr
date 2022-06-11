import type { Signer, providers, utils } from 'ethers';

import { encodeActCall, encodeCallScript, normalizeActions } from './utils';
import { batchForwarderActions } from './modules/aragonos/utils/forwarders';
import type {
  Action,
  ActionFunction,
  Address,
  AppIdentifier,
  Entity,
  ForwardOptions,
  Helper,
} from './types';
import { IPFSResolver } from './IPFSResolver';
import resolver from './utils/resolvers';
import AragonOS from './modules/aragonos/AragonOS';
import Std from './modules/std/Std';

type TransactionReceipt = providers.TransactionReceipt;

/**
 * The default main EVMcrispr class that expose all the functionalities.
 * @category Main
 */
export default class EVMcrispr {
  #addressBook: Map<string, Address>;
  #abiStore: Map<string, utils.Interface>;

  #env: Map<string, any> = new Map();
  protected _ipfsResolver: IPFSResolver;
  #signer: Signer;
  #nonces: { [addr: string]: number } = {};

  aragon: AragonOS;
  std: Std;

  resolver: any;

  protected constructor(signer: Signer) {
    this.#addressBook = new Map();
    this.#abiStore = new Map();
    this._ipfsResolver = new IPFSResolver();
    this.#signer = signer;
    this.resolver = resolver(this);
    this.aragon = new AragonOS(this);
    this.std = new Std(this);
  }

  /**
   * Create a new EVMcrispr instance and connect it to a DAO by fetching and caching all its
   * apps and permissions data.
   * @param signer An ether's [Signer](https://docs.ethers.io/v5/single-page/#/v5/api/signer/-%23-signers)
   * instance used to connect to Ethereum and sign any transaction needed.
   * @param options The optional configuration object.
   * @returns A promise that resolves to a new `EVMcrispr` instance.
   */
  static async create(signer: Signer): Promise<EVMcrispr> {
    const evmcrispr = new EVMcrispr(signer);
    return evmcrispr;
  }

  get ipfsResolver(): IPFSResolver {
    return this._ipfsResolver;
  }

  get signer(): Signer {
    return this.#signer;
  }

  get addressBook(): Map<string, Address> {
    return this.#addressBook;
  }

  get abiStore(): Map<Address, utils.Interface> {
    return this.#abiStore;
  }

  get helpers(): { [name: string]: Helper } {
    return {
      ...this.std.helpers,
      ...this.aragon.helpers,
    };
  }

  incrementNonce(address: string) {
    if (!this.#nonces[address]) {
      this.#nonces[address] = 0;
    }
    return this.#nonces[address]++;
  }

  env(varName: string): any {
    return this.#env.get(varName);
  }

  set(varName: string, value: unknown): ActionFunction {
    return async () => {
      if (varName[0] !== '$') {
        throw new Error('Environment variables must start with $ symbol.');
      }
      this.#env.set(varName, value);
      return [];
    };
  }

  /**
   * Creates an action based on the passed parameters
   * @param target Action's to field
   * @param signature Function signature, such as mint(address,uint256)
   * @param params List of parameters passed to the function
   * @returns A function that returns the encoded action
   */
  encodeAction(
    target: Entity,
    signature: string,
    params: any[],
  ): ActionFunction {
    return async () => {
      if (!/\w+\(((\w+(\[\d*\])*)+(,\w+(\[\d*\])*)*)?\)/.test(signature)) {
        throw new Error('Wrong signature format: ' + signature + '.');
      }
      const paramTypes = signature.split('(')[1].slice(0, -1).split(',');
      return [
        {
          to: this.resolver.resolveEntity(target),
          data: encodeActCall(
            signature,
            this.resolver.resolveParams(params, paramTypes),
          ),
        },
      ];
    };
  }

  /**
   * Send a set of transactions to a contract that implements the IForwarder interface
   * @param forwarder App identifier of the forwarder that is going to be used
   * @param actions List of actions that the forwarder is going to recieive
   * @returns A function that retuns the forward action
   */
  forwardActions(
    forwarder: AppIdentifier,
    actions: ActionFunction[],
  ): ActionFunction {
    return async () => {
      const script = encodeCallScript(await normalizeActions(actions)());
      return [
        {
          to: this.resolver.resolveEntity(forwarder),
          data: encodeActCall('forward(bytes)', [script]),
        },
      ];
    };
  }

  /**
   * Encode a set of actions into one using a path of forwarding apps.
   * @param actions The array of action-returning functions to encode.
   * @param path A group of forwarder app [[Entity | entities]] used to encode the actions.
   * @param options The forward options object.
   * @returns A promise that resolves to an object containing the encoded forwarding action as well as
   * any pre-transactions that need to be executed in advance.
   */
  async encode(
    actionFunctions: ActionFunction[],
    path?: Entity[],
    options?: ForwardOptions,
  ): Promise<{
    actions: Action[];
    forward: () => Promise<TransactionReceipt[]>;
  }> {
    const forwarderActions = await normalizeActions(actionFunctions)();
    const forwarders =
      path?.map((entity) => this.resolver.resolveEntity(entity)).reverse() ||
      [];
    const actions = await batchForwarderActions(
      this.#signer,
      forwarderActions,
      forwarders,
      options?.context,
    );
    return {
      actions: actions,
      forward: () => this._forward(actions, options),
    };
  }

  /**
   * Encode a set of actions into one and send it in a transaction.
   * @param actions The action-returning functions to encode.
   * @param path A group of forwarder app [[Entity | entities]] used to encode the actions.
   * @param options A forward options object.
   * @returns A promise that resolves to a receipt of the sent transaction.
   */
  async forward(
    actions: ActionFunction[],
    path: Entity[],
    options?: ForwardOptions,
  ): Promise<providers.TransactionReceipt[]> {
    const { actions: encodedActions } = await this.encode(
      actions,
      path,
      options,
    );
    return this._forward(encodedActions, options);
  }

  protected async _forward(
    actions: Action[],
    options?: ForwardOptions,
  ): Promise<TransactionReceipt[]> {
    const txs = [];
    for (const action of actions) {
      txs.push(
        await (
          await this.#signer.sendTransaction({
            ...action,
            gasPrice: options?.gasPrice,
            gasLimit: options?.gasLimit,
          })
        ).wait(),
      );
    }
    return txs;
  }
}

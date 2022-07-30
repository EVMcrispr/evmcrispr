import type { Signer } from 'ethers';

import minimist from 'minimist';

import type { Action, EVMcl } from './types';

import { normalizeActions } from './utils';
import EVMcrispr from './EVMcrispr';
import { ErrorException } from './errors';
import type { ConnectedAragonOS } from './modules/aragonos/AragonOS';

class EvmclParser {
  evmcrispr: EVMcrispr;

  constructor(evmcrispr: EVMcrispr) {
    this.evmcrispr = evmcrispr;
  }

  /**
   * Parse an array of arguments that may include environment variables, extensions, or nested arrays
   * @param args Array of arguments in form of strings
   * @returns An array of parsed values ready for EVMcrispr
   */
  async args(args: string[]): Promise<any[]> {
    const { _ } = minimist(args, { string: '_' });
    const _args = await this.#recursiveArgParse(_.map(this.#array, this));
    return _args;
  }

  opts(args: string[]): { [arg: string]: any } {
    const { _, ...opt } = minimist(args);
    _; // Using here to avoid ts error.
    return opt;
  }

  /**
   * Parse argument resolving environment variables ($) and extensions (@)
   * @param arg Argument to be processed
   * @returns Parsed value
   */
  async arg(arg: string): Promise<any> {
    if (arg && arg[0] == '$') {
      return this.#env(arg);
    } else if (arg && arg[0] == '@') {
      return this.#helper(arg)();
    }
    return arg;
  }

  /**
   * Parse string to boolean or undefinied
   * @param arg Either "true", "false", or undefinied
   * @returns True, false, or undefinied
   */
  static bool(arg: string): boolean | undefined {
    if (arg !== undefined && arg !== 'true' && arg !== 'false') {
      throw new Error('Argument must be a boolean or undefined. It is: ' + arg);
    }
    return arg ? arg === 'true' : undefined;
  }

  /**
   * Parse evmcl argument to array. Converts something like "[[0x00,0x01],[0x03]]" to [["0x00","0x01"],["0x03"]]
   * @param arg String with an encoded array
   * @returns Nested array of strings or the argument itself if it is not an encoded array
   */
  #array(arg: string): any {
    if (arg.startsWith('[')) {
      return JSON.parse(
        arg
          .replace(/\[(?!\[)/g, '["')
          .replace(/(?<!\]),/g, '",')
          .replace(/,(?!\[)/g, ',"')
          .replace(/(?<!\])\]/g, '"]'),
      );
    }
    return arg;
  }

  #env(varName: string): any {
    if (typeof this.evmcrispr.env(varName) === 'undefined') {
      throw new Error(`Environment variable ${varName} not defined.`);
    } else {
      return this.evmcrispr.env(varName)!;
    }
  }

  #helper(arg: string): () => Promise<string> {
    const [, ext, ...params] = arg.match(
      /^@([a-zA-Z0-9.]+)(?:\(([^,]+)(?:,([^,]+))*\))?$/, // FIXME: This regex do not support expressions like @h(@h(a,b),c)
    )!;
    return async () => {
      const _params = await this.args(params.filter((p) => !!p));
      try {
        return this.evmcrispr.helpers[ext](..._params)();
      } catch (e) {
        throw new Error(`Helper @${ext} does not exist.`);
      }
    };
  }

  async #recursiveArgParse(arg: any): Promise<any> {
    return Array.isArray(arg)
      ? await Promise.all(arg.map(this.#recursiveArgParse, this))
      : this.arg(arg);
  }
}

export default function evmcl(
  strings: TemplateStringsArray,
  ...keys: string[]
): EVMcl {
  const input =
    strings[0] + keys.map((key, i) => key + strings[i + 1]).join('');
  const commands = input
    .split('\n')
    .map((command) => command.split('#')[0])
    .map((command) => command.trim())
    .filter((command) => !!command);

  let dao = '';
  let path: string[] = [];
  let context = '';
  let daoActions: null | ((aragon: ConnectedAragonOS) => Promise<Action[]>)[] =
    null;

  const actions = async (evmcrispr: EVMcrispr) => {
    const parser = new EvmclParser(evmcrispr);
    return normalizeActions(
      commands.map((command) => {
        const [commandName, ...args] = command
          .replace(/"([^"]*)"/g, (_, s) => s.replace(/ /g, '"'))
          .split(' ')
          .map((s) => s.replace(/"/g, ' '));
        switch (commandName) {
          case 'connect': {
            return async () => {
              if (daoActions) {
                throw new ErrorException(
                  `You can not use connect within connect (at least for now).`,
                );
              }
              daoActions = [];
              const _args = minimist(args, { string: '_' })._;
              if (_args[_args.length - 1] != '(') {
                throw new Error('Malformed connect command.');
              }
              [dao, ...path] = _args.slice(0, -1);
              ({ context } = parser.opts(args));
              return [];
            };
          }
          case 'set': {
            return async () => {
              const [varName, ...rest] = args;
              const value = rest.join(' ');
              return evmcrispr.set(varName, await parser.arg(value))();
            };
          }
          case 'new': {
            return async () => {
              const [subCommand, ...rest] = args;
              switch (subCommand) {
                case 'token': {
                  if (!daoActions) {
                    throw new ErrorException(
                      `You must use connect before using ${commandName} token`,
                    );
                  }
                  daoActions.push(async (aragon: ConnectedAragonOS) => {
                    const [
                      name,
                      symbol,
                      controller,
                      decimals = '18',
                      transferable = 'true',
                    ] = rest;
                    return aragon.newToken(
                      name,
                      symbol,
                      controller,
                      Number(decimals),
                      EvmclParser.bool(transferable)!,
                    )();
                  });
                  return [];
                }
                case 'dao': {
                  const [name] = rest;
                  return evmcrispr.aragon.newDao(name)();
                }
                default: {
                  throw new Error(
                    `Unrecognized subcommand: token ${subCommand}`,
                  );
                }
              }
            };
          }
          case 'install': {
            return async () => {
              if (!daoActions) {
                throw new ErrorException(
                  `You must use connect before using ${commandName}`,
                );
              }
              const [identifier, ...initParams] = await parser.args(args);
              const opts = parser.opts(args);
              daoActions.push((aragon: ConnectedAragonOS) => {
                return aragon.install(identifier, initParams, opts)();
              });
              return [];
            };
          }
          case 'upgrade': {
            return async () => {
              if (!daoActions) {
                throw new ErrorException(
                  `You must use connect before using ${commandName}`,
                );
              }
              const [identifier, appAddress] = await parser.args(args);
              daoActions.push((aragon: ConnectedAragonOS) => {
                return aragon.upgrade(identifier, appAddress)();
              });
              return [];
            };
          }
          case 'grant': {
            return async () => {
              if (!daoActions) {
                throw new ErrorException(
                  `You must use connect before using ${commandName}`,
                );
              }
              const [grantee, app, role, defaultPermissionManager] =
                await parser.args(args);
              const opts = parser.opts(args);
              daoActions.push((aragon: ConnectedAragonOS) => {
                return aragon.grant(
                  grantee,
                  app,
                  role,
                  defaultPermissionManager,
                  opts,
                )();
              });
              return [];
            };
          }
          case 'revoke': {
            return async () => {
              if (!daoActions) {
                throw new ErrorException(
                  `You must use connect before using ${commandName}`,
                );
              }
              const [grantee, app, role, _removePermissionManager] =
                await parser.args(args);
              const removePermissionManager = EvmclParser.bool(
                _removePermissionManager,
              );
              daoActions.push((aragon: ConnectedAragonOS) => {
                return aragon.revoke(
                  grantee,
                  app,
                  role,
                  removePermissionManager || false,
                )();
              });
              return [];
            };
          }
          case 'raw': {
            return async () => {
              const [to, data] = await parser.args(args);
              return [
                {
                  to,
                  data,
                },
              ];
            };
          }
          case 'exec': {
            return async () => {
              const [identifier, method, ...params] = await parser.args(args);
              if (!daoActions) {
                return evmcrispr.std.exec(identifier, method, params)();
              } else {
                daoActions.push((aragon: ConnectedAragonOS) => {
                  return aragon.exec(identifier, method, params)();
                });
                return [];
              }
            };
          }
          case 'act': {
            return async () => {
              if (!daoActions) {
                throw new ErrorException(
                  `You must use connect before using ${commandName}`,
                );
              }
              const [agent, target, signature, ...params] = await parser.args(
                args,
              );
              daoActions.push((aragon: ConnectedAragonOS) => {
                return aragon.act(agent, target, signature, params)();
              });
              return [];
            };
          }
          case ')': {
            return async () => {
              if (!daoActions) {
                throw new ErrorException(
                  `You cannot close with ) if you are not connected to a DAO.`,
                );
              }
              const _daoActions = daoActions;
              daoActions = null;
              return evmcrispr.aragon.connect(
                dao,
                (dao) => [
                  async () => {
                    const x: Action[][] = [];
                    for (const action of _daoActions) {
                      x.push(await action(dao));
                    }
                    return x.flat();
                  },
                ],
                path,
                {
                  context,
                },
              )();
            };
          }
          default:
            throw new Error('Unrecognized command: ' + commandName);
        }
      }),
    );
  };
  return {
    encode: async (signer: Signer | Promise<Signer>) => {
      const evmcrispr = await EVMcrispr.create(signer);
      const _actions = await actions(evmcrispr);
      return evmcrispr.encode([_actions]);
    },
    forward: async (signer: Signer | Promise<Signer>, options) => {
      const evmcrispr = await EVMcrispr.create(signer);
      return evmcrispr.forward([await actions(evmcrispr)], options);
    },
    evmcrispr: async (signer: Signer | Promise<Signer>) => {
      const evmcrispr = await EVMcrispr.create(signer);
      await evmcrispr.encode([await actions(evmcrispr)]);
      return evmcrispr;
    },
    dao,
    path,
  };
}

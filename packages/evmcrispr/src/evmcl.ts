import type { Signer } from 'ethers';

import type { EVMcl } from './types';

import { normalizeActions } from './helpers';
import EVMcrispr from './EVMcrispr';

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
    return this.#recursiveArgParse(args.map(this.#array, this));
  }

  /**
   * Parse argument resolving environment variables ($) and extensions (@)
   * @param arg Argument to be processed
   * @returns Parsed value
   */
  async arg(arg: string): Promise<any> {
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

  const [, dao, pathstr, context] =
    commands[0].match(
      /^connect ([\w.-]+)((?: (?:[\w.]+(?:-[\w.]+)*(?::\d+)?))*)(?: --context (.+))?$/,
    ) || [];
  if (!dao) {
    throw new Error('First line must be a connect statement.');
  }
  commands.shift(); // removes first element
  const path = pathstr.trim().split(' ');
  const actions = async (evmcrispr: EVMcrispr) => {
    const parser = new EvmclParser(evmcrispr);
    return normalizeActions(
      await Promise.all(
        commands.map((command) => {
          const [commandName, ...args] = command
            .replace(/"([^"]*)"/g, (_, s) => s.replace(/ /g, '"'))
            .split(' ')
            .map((s) => s.replace(/"/g, ' '));
          switch (commandName) {
            case 'new': {
              return async () => {
                const [subCommand, ...rest] = args;
                switch (subCommand) {
                  case 'token': {
                    const [
                      name,
                      symbol,
                      controller,
                      decimals = '18',
                      transferable = 'true',
                    ] = rest;
                    return evmcrispr.newToken(
                      name,
                      symbol,
                      controller,
                      Number(decimals),
                      EvmclParser.bool(transferable)!,
                    )();
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
                const [identifier, ...initParams] = await parser.args(args);
                return evmcrispr.install(identifier, initParams)();
              };
            }
            case 'upgrade': {
              return async () => {
                const [identifier, appAddress] = await parser.args(args);
                return evmcrispr.upgrade(identifier, appAddress)();
              };
            }
            case 'grant': {
              return async () => {
                const [grantee, app, role, defaultPermissionManager] =
                  await parser.args(args);
                return evmcrispr.grant(
                  [grantee, app, role],
                  defaultPermissionManager,
                )();
              };
            }
            case 'revoke': {
              return async () => {
                const [grantee, app, role, _removePermissionManager] =
                  await parser.args(args);
                const removePermissionManager = EvmclParser.bool(
                  _removePermissionManager,
                );
                return evmcrispr.revoke(
                  [grantee, app, role],
                  removePermissionManager,
                )();
              };
            }
            case 'exec': {
              return async () => {
                const [identifier, method, ...params] = await parser.args(args);
                return evmcrispr.exec(identifier, method, params)();
              };
            }
            case 'act': {
              return async () => {
                const [agent, target, signature, ...params] = await parser.args(
                  args,
                );
                return evmcrispr.act(agent, target, signature, params)();
              };
            }
            default:
              throw new Error('Unrecognized command: ' + commandName);
          }
        }),
      ),
    );
  };
  return {
    encode: async (signer: Signer, options) => {
      const evmcrispr = await EVMcrispr.create(dao, signer, options);
      return evmcrispr.encode([await actions(evmcrispr)], path, { context });
    },
    forward: async (signer: Signer, options) => {
      const evmcrispr = await EVMcrispr.create(dao, signer, options);
      return evmcrispr.forward([await actions(evmcrispr)], path, {
        context,
        ...options,
      });
    },
    evmcrispr: async (signer: Signer, options) => {
      const evmcrispr = await EVMcrispr.create(dao, signer, options);
      await evmcrispr.encode([await actions(evmcrispr)], path, { context });
      return evmcrispr;
    },
    dao,
    path,
  };
}

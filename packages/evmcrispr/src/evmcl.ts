import { ActionInterpreter, ActionFunction } from "src";
import { normalizeActions } from "./helpers";

function _boolean(arg: string): boolean | undefined {
  if (arg !== undefined && arg !== "true" && arg !== "false") {
    throw new Error("Argument must be a boolean or undefined. It is: " + arg);
  }
  return arg ? arg === "true" : undefined;
}

function _params(params: string[]): any[] {
  return params.map((param) => {
    if (param.startsWith("[")) {
      // Converts something like "[[0x00,0x01],[0x03]]" to [["0x00","0x01"],["0x03"]]
      return JSON.parse(
        param
          .replace(/\[(?!\[)/g, '["')
          .replace(/(?<!\]),/g, '",')
          .replace(/,(?!\[)/g, ',"')
          .replace(/(?<!\])\]/g, '"]')
      );
    } else {
      return param;
    }
  });
}

export default function evmcl(
  strings: TemplateStringsArray,
  ...keys: string[]
): (evm: ActionInterpreter) => ActionFunction {
  const input = strings[0] + keys.map((key, i) => key + strings[i + 1]).join("");
  const commands = input
    .split("\n")
    .map((command) => command.split("#")[0])
    .map((command) => command.trim())
    .filter((command) => !!command);
  return (evmcrispr: ActionInterpreter) => {
    return normalizeActions(
      commands.map((command) => {
        const [commandName, ...args] = command
          .replace(/"([^"]*)"/g, (_, s) => s.replace(/ /g, '"'))
          .split(" ")
          .map((s) => s.replace(/"/g, " "));
        switch (commandName) {
          case "new": {
            const [subCommand, ...rest] = args;
            switch (subCommand) {
              case "token": {
                const [name, symbol, controller, decimals = "18", transferable = "true"] = rest;
                return evmcrispr.newToken(name, symbol, controller, Number(decimals), _boolean(transferable)!);
              }
              default: {
                throw new Error(`Unrecognized subcommand: token ${subCommand}`);
              }
            }
          }
          case "install": {
            const [identifier, ...initParams] = args;
            return evmcrispr.install(identifier, initParams);
          }
          case "upgrade": {
            const [identifier, appAddress] = args;
            return evmcrispr.upgrade(identifier, appAddress);
          }
          case "grant": {
            const [grantee, app, role, defaultPermissionManager] = args;
            return evmcrispr.grant([grantee, app, role], defaultPermissionManager);
          }
          case "revoke": {
            const [grantee, app, role, _removePermissionManager] = args;
            const removePermissionManager = _boolean(_removePermissionManager);
            return evmcrispr.revoke([grantee, app, role], removePermissionManager);
          }
          case "exec": {
            const [identifier, method, ...params] = args;
            return evmcrispr.exec(identifier)[method](..._params(params));
          }
          case "act": {
            const [agent, target, signature, ...params] = args;
            return evmcrispr.act(agent, target, signature, _params(params));
          }
          default:
            throw new Error("Unrecognized command: " + commandName);
        }
      })
    );
  };
}

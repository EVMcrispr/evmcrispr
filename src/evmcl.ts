import { ActionInterpreter, Action } from "src";
import { normalizeActions } from "./helpers";

function _boolean(arg: string): boolean | undefined {
  if (arg !== undefined && arg !== "true" && arg !== "false") {
    throw new Error("Argument must be a boolean or undefined. It is: " + arg);
  }
  return arg ? arg === "true" : undefined;
}

export default function evmcl(
  strings: TemplateStringsArray,
  ...keys: string[]
): (evm: ActionInterpreter) => Promise<Action[]> {
  const input = strings[0] + keys.map((key, i) => key + strings[i + 1]).join("");
  const commands = input
    .split("\n")
    .map((command) => command.trim())
    .filter((command) => !!command);
  return async (evmcrispr: ActionInterpreter) => {
    return normalizeActions(
      commands.map((command) => {
        const [commandName, ...args] = command.split(" ");
        switch (commandName) {
          case "install": {
            const [identifier, ...initParams] = args;
            return evmcrispr.installNewApp(identifier, initParams);
          }
          case "grant": {
            const [grantee, app, role, defaultPermissionManager] = args;
            return evmcrispr.addPermission([grantee, app, role], defaultPermissionManager);
          }
          case "revoke": {
            const [grantee, app, role, _removePermissionManager] = args;
            const removePermissionManager = _boolean(_removePermissionManager);
            return evmcrispr.revokePermission([grantee, app, role], removePermissionManager);
          }
          case "exec": {
            const [identifier, method, ...params] = args;
            return evmcrispr.call(identifier)[method](...params);
          }
          case "act": {
            const [agent, target, signature, ...params] = args;
            return evmcrispr.act(agent, target, signature, params);
          }
          default:
            throw new Error("Unrecognized command: " + commandName);
        }
      })
    );
  };
}

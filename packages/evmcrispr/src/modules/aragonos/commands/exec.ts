import type {
  ActionFunction,
  AppIdentifier,
  LabeledAppIdentifier,
} from '../../..';
import { getFunctionParams } from '../../../utils';
import type { ConnectedAragonOS } from '../AragonOS';

/**
 * Encode an action that calls an app's contract function.
 * @param appIdentifier The [[AppIdentifier | identifier]] of the app to call to.
 * @param functionName Function name, such as mint.
 * @param params Array with the parameters passed to the encoded function.
 * @returns A function that retuns an action to forward a call with the specified parameters
 */
export function exec(
  module: ConnectedAragonOS,
  appIdentifier: AppIdentifier | LabeledAppIdentifier,
  functionName: string,
  params: any[],
): ActionFunction {
  return async () => {
    try {
      const targetApp = module.resolveApp(appIdentifier);
      const [, paramTypes] = getFunctionParams(
        functionName,
        targetApp.abiInterface,
      );
      return [
        {
          to: targetApp.address,
          data: targetApp.abiInterface.encodeFunctionData(
            functionName,
            await module.evm.resolver.resolvePromises(params, paramTypes),
          ),
        },
      ];
    } catch (err: any) {
      try {
        if (!module.resolveEntity(appIdentifier)) {
          throw err;
        }
        return module.evm.encodeAction(appIdentifier, functionName, params)();
      } catch (e: any) {
        err.message = `Error when encoding call to method ${functionName} of app ${appIdentifier}: ${err.message}`;
        throw err;
      }
    }
  };
}

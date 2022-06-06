import type { ActionFunction, AppIdentifier, Entity } from '../../..';
import type AragonOS from '../AragonOS';

/**
 * Use DAO agent to call an external contract function
 * @param agent App identifier of the agent that is going to be used to call the function
 * @param target Address of the external contract
 * @param signature Function signature that is going to be called
 * @param params Array of parameters that are going to be used to call the function
 * @returns A function that retuns an action to forward an agent call with the specified parameters
 */
export function act(
  module: AragonOS,
  agent: AppIdentifier,
  target: Entity,
  signature: string,
  params: any[],
): ActionFunction {
  return async () => {
    return module.evm.forwardActions(agent, [
      module.evm.encodeAction(target, signature, params),
    ])();
  };
}

// /**
//  * Use DAO agent to perform a set of transactions using agent's execute function
//  * @param agent App identifier of the agent that is going to be used to perform the actions
//  * @param actions List of actions that the agent is going to perform
//  * @returns A function that retuns an action to forward an agent call with the specified parameters
//  */
// agentExec(
//   agent: AppIdentifier,
//   actions: ActionFunction[],
//   useSafeExecute = false,
// ): ActionFunction {
//   return async () => {
//     return (
//       await Promise.all(
//         (
//           await normalizeActions(actions)()
//         ).map((action) =>
//           useSafeExecute
//             ? this.exec(agent, 'safeExecute', [action.to, action.data])()
//             : this.exec(agent, 'execute', [
//                 action.to,
//                 action.value ?? 0,
//                 action.data,
//               ])(),
//         ),
//       )
//     ).flat();
//   };
// }

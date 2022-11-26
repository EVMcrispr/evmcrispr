/**
 * An object that represents an action in the DAO (e.g. installing a new app, minting tokens, etc).
 */
export interface TransactionAction {
  /**
   * The recipient address.
   */
  to: string;
  /**
   * The encoded action. It can be conceived of as contract function calls.
   */
  data: string;
  /**
   * The ether which needs to be sent along with the action (in wei).
   */
  value?: string | number;

  /**
   * The sender address. It can only be used in contexts where you can choose who is sending the transaction.
   */
  from?: string;
}

export interface ProviderAction {
  method: string;
  params: any[];
}

export type Action = TransactionAction | ProviderAction;

// TODO: find a better way to check for action types
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isProviderAction(action: any): action is ProviderAction {
  return action.method && action.params;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isSwitchAction(action: any): boolean {
  return action.method === 'wallet_switchEthereumChain';
}

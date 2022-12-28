/**
 * A call script.
 */
export interface CallScriptAction {
  /**
   * The action's target.
   */
  to: string;
  /**
   * The action's calldata.
   */
  data: string;
}

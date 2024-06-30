import type { Address } from "viem";

/**
 * A call script.
 */
export interface CallScriptAction {
  /**
   * The action's target.
   */
  to: Address;
  /**
   * The action's calldata.
   */
  data: `0x${string}`;
}

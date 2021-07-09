import { utils } from "ethers";

export function createExecutorId(id: number): string {
  return `0x${String(id).padStart(8, "0")}`;
}

export const EMPTY_CALLS_SCRIPT = createExecutorId(1);

/**
 * Encode ACT function call
 * @param {string} signature Function signature
 * @param {any[]} params
 */
export function encodeActCall(signature: string, params: any[] = []): string {
  /* 
    const sigBytes = ethers.utils.Interface.getSighash(
        ethers.utils.Fragment.from(
          "function migrate(address,address,address,address,uint256,uint64,uint64,uint64) external"
        )
      );
  */
  const sigBytes = utils.hexDataSlice(utils.id(signature), 0, 4);
  const types = signature.replace(")", "").split("(")[1];

  // No params, return signature directly
  if (types === "") {
    return sigBytes;
  }

  const paramBytes = new utils.AbiCoder().encode(types.split(","), params);

  return `${sigBytes}${paramBytes.slice(2)}`;
}

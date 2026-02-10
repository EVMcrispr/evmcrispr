import type { AbiItem, AbiParameter } from "viem";
import { isAddressEqual, parseAbiItem } from "viem";

import type { Address } from "../types";

export const isFunctionSignature = (signature: string) => {
  try {
    parseAbiItem(`function ${signature} external`);
    if (signature.includes(",)")) {
      // Viem does not catch fn(a,) as invalid
      return false;
    }
    return true;
  } catch (_error) {
    return false;
  }
};

export const toDecimals = (amount: number | string, decimals = 18): bigint => {
  const [integer, decimal] = String(amount).split(".");
  return BigInt(
    (integer !== "0" ? integer : "") + (decimal || "").padEnd(decimals, "0") ||
      "0",
  );
};

export function addressesEqual(first: Address, second: Address): boolean {
  return isAddressEqual(first, second);
}

export function getFunctionFragment(func: AbiItem | undefined) {
  if (func?.type === "function") {
    const formatParameter = (input: AbiParameter): string => {
      /* Test cases:
      switch mainnet
      set $factory 0xFbeC16EECD4558297FB3deA9934A162Ef76b14bd 
      exec $factory createFirm((address[],uint256),(bool,bool,((uint256,address,address,uint256,bytes6,string)[]),((bytes32,string,address[])[]),(string,(string,string,uint128,uint32,uint16,address)[],(uint256,address,uint256)[]),(uint256,uint256,uint256,uint256),(bool,bool,bool,(uint8,address,bytes4)[])),uint256)
      */

      const typeString = input.type;
      let baseTypeName = typeString;
      let arraySuffix = "";

      // Regex to match array suffixes like [], [N], [][N], [N][M], etc. at the end of the type string.
      // It captures the full array dimension part, e.g., "[][5]" from "bytes32[][5]".
      const arrayMatcher = /((?:\[[0-9]*\])+)$/;
      const match = typeString.match(arrayMatcher);

      if (match) {
        arraySuffix = match[0]; // This will be "[]", "[5]", "[][5]", etc.
        baseTypeName = typeString.substring(
          0,
          typeString.length - arraySuffix.length,
        ); // This will be "bytes32", "uint256", "tuple", etc.
      }

      let processedBaseType: string;

      if (baseTypeName === "tuple") {
        // If the base type is a tuple, recursively format its components.
        if ("components" in input && Array.isArray(input.components)) {
          processedBaseType = `(${input.components.map(formatParameter).join(",")})`;
        } else {
          // Fallback for tuples defined without components or if 'components' isn't an array
          // (which shouldn't happen with a valid ABI).
          processedBaseType = "tuple";
        }
      } else {
        processedBaseType = baseTypeName;
      }

      // Reconstruct the full type string by appending the extracted array suffix.
      return `${processedBaseType}${arraySuffix}`;
    };

    return `function ${func.name}(${func.inputs.map(formatParameter).join(",")})${func.outputs.length > 0 ? ` returns (${func.outputs.map(formatParameter).join(",")})` : ""}`;
  }
  throw new Error("invalid function");
}

import { ErrorInvalid } from "@evmcrispr/sdk";
import { keccak256, toHex } from "viem";

export const normalizeRole = (role: string): string => {
  if (role.startsWith("0x")) {
    if (role.length !== 66) {
      throw new ErrorInvalid("Invalid role provided", {
        name: "ErrorInvalidRole",
      });
    }
    return role;
  }

  return keccak256(toHex(role));
};

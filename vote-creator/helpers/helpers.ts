import { ethers } from "hardhat";

export const ZERO_ADDRESS = "0x" + "0".repeat(40); // 0x0000...0000

export const TX_GAS_LIMIT = 10000000;

export const TX_GAS_PRICE = 10000000000;

export const normalizeRole = (role: string): string => {
  return role.startsWith("0x") && role.length === 64 ? role : ethers.utils.keccak256(role);
};

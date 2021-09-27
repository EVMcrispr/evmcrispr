export { encodeCallScript, erc20ABI } from "@1hive/connect-core";
export * from "./acl";
export * from "./apps";
export * from "./evmscripts";
export * from "./forwarders";
export * from "./identifiers";
export * from "./interfaces";
export * from "./ipfs";
export * from "./normalizers";
export * from "./queries";
export * from "./web3";

export const TX_GAS_LIMIT = 10_000_000;
export const TX_GAS_PRICE = 10_000_000_000; // 10 gwei

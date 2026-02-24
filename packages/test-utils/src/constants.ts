export const TEST_ACCOUNT_ADDRESS =
  "0x1234567890abcdef1234567890abcdef12345678";

// Std-module helper lists used by completion tests across all modules.
// When a std helper is added/removed, update only here.

export const STD_ALL_HELPERS = [
  "@abi.encodeCall",
  "@and",
  "@bool",
  "@concat",
  "@date",
  "@ens",
  "@get",
  "@id",
  "@ipfs",
  "@me",
  "@namehash",
  "@nextContract",
  "@not",
  "@or",
  "@token",
  "@token.amount",
  "@token.balance",
];

export const STD_ADDRESS_HELPERS = [
  "@ens",
  "@get",
  "@me",
  "@nextContract",
  "@token",
];

export const STD_NUMBER_HELPERS = [
  "@date",
  "@get",
  "@token.amount",
  "@token.balance",
];

export const STD_BYTES32_HELPERS = ["@get", "@id", "@namehash"];

export const STD_BOOL_HELPERS = ["@and", "@bool", "@get", "@not", "@or"];

export const STD_BYTES_HELPERS = ["@abi.encodeCall", "@get"];

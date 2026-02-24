export const TEST_ACCOUNT_ADDRESS =
  "0x1234567890abcdef1234567890abcdef12345678";

// Std-module helper lists used by completion tests across all modules.
// When a std helper is added/removed, update only here.

export const STD_ALL_HELPERS = [
  "@abi.encodeCall",
  "@and",
  "@at",
  "@bool",
  "@concat",
  "@date",
  "@ens",
  "@filter",
  "@get",
  "@id",
  "@includes",
  "@ipfs",
  "@len",
  "@map",
  "@me",
  "@namehash",
  "@nextContract",
  "@not",
  "@or",
  "@range",
  "@slice",
  "@str.join",
  "@str.lower",
  "@str.replace",
  "@str.split",
  "@str.upper",
  "@token",
  "@token.amount",
  "@token.balance",
];

export const STD_ADDRESS_HELPERS = [
  "@at",
  "@ens",
  "@get",
  "@me",
  "@nextContract",
  "@token",
];

export const STD_NUMBER_HELPERS = [
  "@at",
  "@date",
  "@get",
  "@len",
  "@token.amount",
  "@token.balance",
];

export const STD_BYTES32_HELPERS = ["@at", "@get", "@id", "@namehash"];

export const STD_BOOL_HELPERS = [
  "@and",
  "@at",
  "@bool",
  "@get",
  "@includes",
  "@not",
  "@or",
];

export const STD_BYTES_HELPERS = ["@abi.encodeCall", "@at", "@get"];

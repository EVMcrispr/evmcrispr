export const TEST_ACCOUNT_ADDRESS =
  "0x1234567890abcdef1234567890abcdef12345678";

// Std-module helper lists used by completion tests across all modules.
// When a std helper is added/removed, update only here.

export const STD_ALL_HELPERS = [
  "@abi.decode",
  "@abi.encodeCall",
  "@abi.encodePacked",
  "@arr",
  "@block",
  "@bool",
  "@bytes",
  "@contract.codeAt",
  "@contract.next",
  "@contract.storageAt",
  "@date",
  "@ens",
  "@gas.estimate",
  "@gas.price",
  "@get",
  "@id",
  "@ipfs",
  "@me",
  "@namehash",
  "@nonce",
  "@num",
  "@sigValid",
  "@str",
  "@token",
  "@token.amount",
  "@token.balance",
];

export const STD_ADDRESS_HELPERS = [
  "@block",
  "@contract.next",
  "@ens",
  "@get",
  "@me",
  "@token",
];

export const STD_NUMBER_HELPERS = [
  "@block",
  "@date",
  "@gas.estimate",
  "@gas.price",
  "@get",
  "@nonce",
  "@num",
  "@token.amount",
  "@token.balance",
];

export const STD_BYTES32_HELPERS = [
  "@block",
  "@contract.storageAt",
  "@get",
  "@id",
  "@namehash",
];

export const STD_BOOL_HELPERS = ["@block", "@bool", "@get", "@sigValid"];

export const STD_BYTES_HELPERS = [
  "@abi.encodeCall",
  "@abi.encodePacked",
  "@block",
  "@bytes",
  "@contract.codeAt",
  "@get",
];

// Http-module helper lists.

export const HTTP_ALL_HELPERS = ["@fetch", "@json", "@json.format"];

// @json has returnType "any", so it appears in every type-specific list.
// @fetch and @json.format have returnType "string", so they only appear in HTTP_ALL_HELPERS.

export const HTTP_ADDRESS_HELPERS = ["@json"];
export const HTTP_NUMBER_HELPERS = ["@json"];
export const HTTP_BYTES32_HELPERS = ["@json"];
export const HTTP_BOOL_HELPERS = ["@json"];
export const HTTP_BYTES_HELPERS = ["@json"];

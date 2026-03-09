export const TEST_ACCOUNT_ADDRESS =
  "0x1234567890abcdef1234567890abcdef12345678";

// Std-module helper lists used by completion tests across all modules.
// When a std helper is added/removed, update only here.

export const STD_ALL_HELPERS = [
  "@abi.encodeCall",
  "@and",
  "@at",
  "@bool",
  "@bytes",
  "@bytes.at",
  "@bytes.concat",
  "@bytes.len",
  "@bytes.not",
  "@bytes.slice",
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
  "@str.at",
  "@str.concat",
  "@str.includes",
  "@str.join",
  "@str.len",
  "@str.lower",
  "@str.replace",
  "@str.slice",
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
  "@bytes.len",
  "@date",
  "@get",
  "@len",
  "@str.len",
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
  "@str.includes",
];

export const STD_BYTES_HELPERS = [
  "@abi.encodeCall",
  "@at",
  "@bytes",
  "@bytes.at",
  "@bytes.concat",
  "@bytes.not",
  "@bytes.slice",
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

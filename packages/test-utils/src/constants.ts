export const TEST_ACCOUNT_ADDRESS =
  "0x1234567890abcdef1234567890abcdef12345678";

// Std-module helper lists used by completion tests across all modules.
// When a std helper is added/removed, update only here.

export const STD_ALL_HELPERS = [
  "@abi.encodeCall",
  "@all",
  "@any",
  "@at",
  "@bool",
  "@bytes",
  "@bytes.at",
  "@bytes.concat",
  "@bytes.len",
  "@bytes.not",
  "@bytes.slice",
  "@concat",
  "@contract.codeAt",
  "@contract.next",
  "@contract.storageAt",
  "@date",
  "@ens",
  "@enumerate",
  "@filter",
  "@find",
  "@flat",
  "@get",
  "@id",
  "@includes",
  "@ipfs",
  "@len",
  "@map",
  "@me",
  "@namehash",
  "@num",
  "@num.format",
  "@num.parse",
  "@range",
  "@reduce",
  "@reverse",
  "@slice",
  "@sort",
  "@str",
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
  "@unique",
  "@unzip",
  "@zip",
];

export const STD_ADDRESS_HELPERS = [
  "@at",
  "@contract.next",
  "@ens",
  "@find",
  "@get",
  "@me",
  "@reduce",
  "@token",
];

export const STD_NUMBER_HELPERS = [
  "@at",
  "@bytes.len",
  "@date",
  "@find",
  "@get",
  "@len",
  "@num",
  "@num.parse",
  "@reduce",
  "@str.len",
  "@token.amount",
  "@token.balance",
];

export const STD_BYTES32_HELPERS = [
  "@at",
  "@contract.storageAt",
  "@find",
  "@get",
  "@id",
  "@namehash",
  "@reduce",
];

export const STD_BOOL_HELPERS = [
  "@all",
  "@any",
  "@at",
  "@bool",
  "@find",
  "@get",
  "@includes",
  "@reduce",
  "@str.includes",
];

export const STD_BYTES_HELPERS = [
  "@abi.encodeCall",
  "@at",
  "@bytes",
  "@contract.codeAt",
  "@bytes.at",
  "@bytes.concat",
  "@bytes.not",
  "@bytes.slice",
  "@find",
  "@get",
  "@reduce",
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

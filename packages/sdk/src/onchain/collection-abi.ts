import { parseAbi, toFunctionSelector } from "viem";

export const COLLECTIONS_ABI = parseAbi([
  "struct Callback { address target; bytes4 selector; string arguments; bytes[] constants; uint256 first; uint256 second; bytes program; }",
  "function packArray(string elementType, bytes[] values) pure returns (bytes)",
  "function unpackArray(string elementType, bytes encoded) pure returns (bytes[])",
  "function mapValues(string inputType, string outputType, bytes[] values, Callback cb) view returns (bytes[])",
  "function filterValues(string inputType, bytes[] values, Callback cb) view returns (bytes[])",
  "function foldValues(string inputType, string accumulatorType, bytes[] values, bytes initial, Callback cb) view returns (bytes)",
  "function sortValues(string inputType, bytes[] values, Callback cb) view returns (bytes[])",
  "function uniqueValues(string inputType, bytes[] values, Callback cb, bool ordered) view returns (bytes[])",
  "function flattenValues(string inputType, bytes[][] values) pure returns (bytes[])",
  "function reverseValues(string inputType,bytes[] values) pure returns (bytes[])",
  "function sliceValues(string inputType,bytes[] values,int256 start,int256 end) pure returns (bytes[])",
  "function indexOfValues(string inputType,bytes[] values,bytes needle,Callback cb) view returns (uint256)",
  "function anyValues(string inputType,bytes[] values,Callback cb) view returns (bool)",
  "function allValues(string inputType,bytes[] values,Callback cb) view returns (bool)",
  "function findValues(string inputType,bytes[] values,Callback cb) view returns (uint256)",
  "function zipValues(string leftType,string rightType,bytes[] left,bytes[] right) pure returns (bytes[])",
  "function unzipValues(string leftType,string rightType,bytes[] pairs,uint256 lane) pure returns (bytes[])",
  // bounded folds (FoldExit as uint8: Full = 0, Any = 1, All = 2)
  "function foldRange(uint256 n, address target, bytes template, uint256 accOffset, uint256[] elemOffsets, bytes32 init, uint8 exit) view returns (bytes32)",
  "function foldBytes(bytes s, address target, bytes template, uint256 accOffset, uint256[] elemOffsets, bytes32 init, uint8 exit) view returns (bytes32)",
  "function foldWords(bytes s, address target, bytes template, uint256 accOffset, uint256[] elemOffsets, bytes32 init, uint8 exit) view returns (bytes32)",
  // array-shape ops over aligned-word bytes payloads
  "function mapWords(bytes s, address target, bytes template, uint256[] elemOffsets) view returns (bytes)",
  "function filterWords(bytes s, address target, bytes template, uint256[] elemOffsets) view returns (bytes)",
  "function iotaWords(uint256 n) pure returns (bytes)",
  "function wordIndexOf(bytes s, bytes32 w) pure returns (uint256)",
  "function reverseWords(bytes s) pure returns (bytes)",
  "function zipWords(bytes a, bytes b) pure returns (bytes)",
  "function unzipWords(bytes s, uint256 which) pure returns (bytes)",
  "function sortWords(bytes s) pure returns (bytes)",
  "function uniqueWords(bytes s, bool ordered) pure returns (bytes)",
  "function sumWords(bytes s) pure returns (uint256)",
]);

export const COLLECTION_SELECTORS: ReadonlySet<string> = new Set(
  COLLECTIONS_ABI.filter((entry) => entry.type === "function").map((entry) =>
    toFunctionSelector(entry),
  ),
);

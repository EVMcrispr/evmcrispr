import { parseAbi } from "viem";

export const SEMANTIC_VERSION_REGEX = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/;

export const REPO_ABI = parseAbi([
  "function getBySemanticVersion(uint16[3] _semanticVersion) public view returns (uint16[3] semanticVersion, address contractAddress, bytes contentURI)",
  "function getLatest() public view returns (uint16[3] semanticVersion, address contractAddress, bytes contentURI)",
  "function getLatestForContractAddress(address _contractAddress) public view returns (uint16[3] semanticVersion, address contractAddress, bytes contentURI)",
]);

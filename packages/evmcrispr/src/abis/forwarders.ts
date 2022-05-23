export const rawForwarderABI = [
  'function forward(bytes evmCallScript) public',
  'function isForwarder() external pure returns (bool)',
  'function canForward(address sender, bytes evmCallScript) public view returns (bool)',
];

export const forwarderFeeABI = [
  'function forwardFee() external view returns (address, uint256)',
];

export const forwarderABI = [
  ...rawForwarderABI,
  ...forwarderFeeABI,
  // Function missing on Connect's forwarder abi
  'function forwarderType() external pure returns (uint8)',
];

import { parseAbi } from "viem";

export const automateAbi = parseAbi([
  "function createTask(address execAddress, bytes execData, (uint8[] modules, bytes[] args) moduleData, address feeToken) returns (bytes32 taskId)",
  "function cancelTask(bytes32 taskId)",
  "function getTaskId(address taskCreator, address execAddress, bytes4 execSelector, (uint8[] modules, bytes[] args) moduleData, address feeToken) pure returns (bytes32 taskId)",
  "function getTaskIdsByUser(address taskCreator) view returns (bytes32[])",
  "function gelato() view returns (address)",
  "function exec(address taskCreator, address execAddress, bytes execData, (uint8[] modules, bytes[] args) moduleData, uint256 txFee, address feeToken, bool revertOnFailure)",
  "function exec1Balance(address taskCreator, address execAddress, bytes execData, (uint8[] modules, bytes[] args) moduleData, (address sponsor, address feeToken, uint256 oneBalanceChainId, uint256 nativeToFeeTokenXRateNumerator, uint256 nativeToFeeTokenXRateDenominator, bytes32 correlationId) oneBalanceParam, bool revertOnFailure)",
  "event TaskCreated(address indexed taskCreator, address indexed execAddress, bytes execDataOrSelector, (uint8[] modules, bytes[] args) moduleData, address feeToken, bytes32 indexed taskId)",
  "event TaskCancelled(bytes32 taskId, address taskCreator)",
]);

export const opsProxyFactoryAbi = parseAbi([
  "function determineProxyAddress(address account) view returns (address)",
  "function getProxyOf(address account) view returns (address, bool)",
]);

export const oneBalanceAbi = parseAbi([
  "function depositToken(address sponsor, address token, uint256 amount)",
  "function requestWithdrawal(address token, uint256 withdrawalAmount)",
  "function withdraw(address token, uint256 amount, uint256 totalValidRequestedWithdrawAmount, bytes32[] merkleProof)",
  "function cancelWithdrawalRequest(address token, uint256 cancelledAmount, uint256 totalValidRequestedWithdrawAmount, bytes32[] merkleProof)",
  "function totalDepositedAmount(address sponsor, address token) view returns (uint256)",
  "function totalWithdrawnAmount(address sponsor, address token) view returns (uint256)",
]);

/** The dedicated msg.sender (OpsProxy): what tasks execute through. */
export const opsProxyAbi = parseAbi([
  "function executeCall(address target, bytes data, uint256 value) payable",
  "function batchExecuteCall(address[] targets, bytes[] datas, uint256[] values) payable",
]);

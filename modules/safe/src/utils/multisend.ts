import type { TransactionAction } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import { concatHex, encodeFunctionData, encodePacked, size } from "viem";

/**
 * Pack actions into the MultiSend `transactions` bytes: for each action,
 * `uint8 operation ++ address to ++ uint256 value ++ uint256 dataLength ++ bytes data`
 * with no padding between fields.
 */
export const packMultiSendTransactions = (
  actions: TransactionAction[],
): `0x${string}` =>
  concatHex(
    actions.map((action) => {
      if (!action.to) {
        throw new ErrorException(
          "contract deployments (CREATE) are not supported inside a Safe transaction",
        );
      }
      const data = action.data ?? "0x";
      return encodePacked(
        ["uint8", "address", "uint256", "uint256", "bytes"],
        [
          action.operation ?? 0,
          action.to,
          action.value ?? 0n,
          BigInt(size(data)),
          data,
        ],
      );
    }),
  );

export const encodeMultiSendCall = (
  actions: TransactionAction[],
): `0x${string}` =>
  encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "multiSend",
        stateMutability: "payable",
        inputs: [{ name: "transactions", type: "bytes" }],
        outputs: [],
      },
    ],
    functionName: "multiSend",
    args: [packMultiSendTransactions(actions)],
  });

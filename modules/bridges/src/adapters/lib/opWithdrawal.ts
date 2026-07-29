import type { Action, Module } from "@evmcrispr/sdk";
import { clientFor, ErrorException } from "@evmcrispr/sdk";
import type { Address, Hex, PublicClient, TransactionReceipt } from "viem";
import { encodeFunctionData, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { publicActionsL1, publicActionsL2 } from "viem/op-stack";
import { OP_ROUTES } from "../../addresses";

/**
 * OP Stack L2 → L1 withdrawals: prove then finalize, using viem's op-stack
 * extension to fetch the output-root proof from the L1 dispute-game /
 * L2OutputOracle and the L2 state proof.
 */

const portalAbi = parseAbi([
  "struct WithdrawalTransaction { uint256 nonce; address sender; address target; uint256 value; uint256 gasLimit; bytes data; }",
  "struct OutputRootProof { bytes32 version; bytes32 stateRoot; bytes32 messagePasserStorageRoot; bytes32 latestBlockhash; }",
  "function proveWithdrawalTransaction(WithdrawalTransaction tx, uint256 disputeGameIndex, OutputRootProof outputRootProof, bytes[] withdrawalProof)",
  "function finalizeWithdrawalTransaction(WithdrawalTransaction tx)",
]);

function l1Client(module: Module): Promise<PublicClient> {
  return clientFor(module, mainnet.id);
}

/**
 * Build the next step of an OP withdrawal: prove when it's ready to prove,
 * finalize when the challenge window has elapsed.
 */
export async function buildOpWithdrawalClaim(
  module: Module,
  l2ChainId: number,
  txHash: Hex,
): Promise<Action[]> {
  const route = OP_ROUTES[l2ChainId];
  if (!route) {
    throw new ErrorException(
      `no OP Stack route registered for chain ${l2ChainId}`,
    );
  }

  const l2 = (await clientFor(module, l2ChainId)).extend(
    publicActionsL2(),
  ) as any;
  const l1 = (await l1Client(module)).extend(publicActionsL1()) as any;

  const receipt: TransactionReceipt = await l2.getTransactionReceipt({
    hash: txHash,
  });
  const targetChain = { ...l2.chain, contracts: opContracts(route) };

  const status = await l1.getWithdrawalStatus({
    receipt,
    targetChain,
  });

  if (status === "waiting-to-prove") {
    throw new ErrorException(
      "this withdrawal can't be proven yet — the L2 output root containing it hasn't been published to L1. Retry once @bridges:status reports claimable.",
    );
  }
  if (status === "waiting-to-finalize") {
    throw new ErrorException(
      "this withdrawal is proven but still inside the 7-day challenge window; claim again once @bridges:status reports claimable",
    );
  }
  if (status === "finalized") {
    throw new ErrorException("this withdrawal has already been finalized");
  }

  const [withdrawal] = await l2.getWithdrawals({ receipt });

  if (status === "ready-to-prove") {
    const { output, withdrawal: w } = await l1.waitToProve({
      receipt,
      targetChain,
    });
    const args = await l2.buildProveWithdrawal({
      output,
      withdrawal: w,
    });
    return [
      {
        to: route.portal,
        data: encodeFunctionData({
          abi: portalAbi,
          functionName: "proveWithdrawalTransaction",
          args: [
            args.withdrawal,
            args.l2OutputIndex ?? args.disputeGameIndex ?? 0n,
            args.outputRootProof,
            args.withdrawalProof,
          ],
        }),
      },
    ];
  }

  // ready-to-finalize
  return [
    {
      to: route.portal,
      data: encodeFunctionData({
        abi: portalAbi,
        functionName: "finalizeWithdrawalTransaction",
        args: [withdrawal],
      }),
    },
  ];
}

export async function getOpWithdrawalStatus(
  module: Module,
  l2ChainId: number,
  txHash: Hex,
): Promise<"pending" | "claimable" | "done" | "unknown"> {
  const route = OP_ROUTES[l2ChainId];
  if (!route) return "unknown";
  try {
    const l2 = (await clientFor(module, l2ChainId)).extend(
      publicActionsL2(),
    ) as any;
    const l1 = (await l1Client(module)).extend(publicActionsL1()) as any;
    const receipt = await l2.getTransactionReceipt({ hash: txHash });
    const status = await l1.getWithdrawalStatus({
      receipt,
      targetChain: { ...l2.chain, contracts: opContracts(route) },
    });
    if (status === "finalized") return "done";
    if (status === "ready-to-prove" || status === "ready-to-finalize") {
      return "claimable";
    }
    return "pending";
  } catch {
    return "unknown";
  }
}

function opContracts(route: { portal: Address; l1Bridge: Address }) {
  return {
    portal: { [mainnet.id]: { address: route.portal } },
    l1StandardBridge: { [mainnet.id]: { address: route.l1Bridge } },
  };
}

import "../../setup";
import {
  describeParity,
  installSelectorMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters, toFunctionSelector } from "viem";
import { helpers } from "../../../src/_generated";

/**
 * @vault's ERC-4626 reads, against sDAI on Gnosis.
 *
 * The plain ERC-4626 surface is covered by value against sDAI. The ERC-7540
 * async surface has no implementation on the fork, so it goes against a
 * selector-dispatching mock — which is weaker and the cases say so: they show
 * that each helper issues the same call on both faces and decodes the bytes
 * the same way, and nothing about a real async vault's behaviour.
 */

/** Savings xDAI: a real ERC-4626 whose asset is WXDAI. */
const SDAI = "0xaf204776c7245bF4147c2612BF6e5972Ee483701";
const HOLDER = "0xd0Dd6cEF72143E22cCED4867eb0d5F2328715533";
const ONE = "1000000000000000000";
/** An ERC-7540 async vault, mocked: nothing on the fork implements one. */
const ASYNC = "0x0000000000000000000000000000000000007540";
const WORD = (v: bigint) =>
  encodeAbiParameters([{ type: "uint256" }], [v]) as `0x${string}`;

describeParity("@vault", {
  module: "vault",
  helpers,
  setup: (client) =>
    installSelectorMock(client, ASYNC, [
      {
        selector: toFunctionSelector(
          "function pendingDepositRequest(uint256,address) view returns (uint256)",
        ),
        data: WORD(1000n),
      },
      {
        selector: toFunctionSelector(
          "function claimableDepositRequest(uint256,address) view returns (uint256)",
        ),
        data: WORD(250n),
      },
      {
        selector: toFunctionSelector(
          "function pendingRedeemRequest(uint256,address) view returns (uint256)",
        ),
        data: WORD(7n),
      },
      {
        selector: toFunctionSelector(
          "function claimableRedeemRequest(uint256,address) view returns (uint256)",
        ),
        data: WORD(3n),
      },
      {
        selector: toFunctionSelector(
          "function isOperator(address,address) view returns (bool)",
        ),
        data: WORD(1n),
      },
      {
        selector: toFunctionSelector("function share() view returns (address)"),
        data: encodeAbiParameters([{ type: "address" }], [SDAI]),
      },
    ]),
  cases: [
    {
      name: "pendingDeposit reads pendingDepositRequest on both faces",
      run: `@vault:pendingDeposit(${ASYNC} ${HOLDER})`,
      compile: `@vault:pendingDeposit!(${ASYNC} ${HOLDER})`,
    },
    {
      name: "claimableDeposit reads claimableDepositRequest on both faces",
      run: `@vault:claimableDeposit(${ASYNC} ${HOLDER})`,
      compile: `@vault:claimableDeposit!(${ASYNC} ${HOLDER})`,
    },
    {
      name: "pendingRedeem reads pendingRedeemRequest on both faces",
      run: `@vault:pendingRedeem(${ASYNC} ${HOLDER})`,
      compile: `@vault:pendingRedeem!(${ASYNC} ${HOLDER})`,
    },
    {
      name: "claimableRedeem reads claimableRedeemRequest on both faces",
      run: `@vault:claimableRedeem(${ASYNC} ${HOLDER})`,
      compile: `@vault:claimableRedeem!(${ASYNC} ${HOLDER})`,
    },
    {
      name: "isOperator reads isOperator on both faces",
      run: `@vault:isOperator(${ASYNC} ${HOLDER} ${HOLDER})`,
      compile: `@vault:isOperator!(${ASYNC} ${HOLDER} ${HOLDER})`,
    },
    {
      name: "share reads the share token on both faces",
      run: `@vault:share(${ASYNC})`,
      compile: `@vault:share!(${ASYNC})`,
    },
    {
      name: "asset resolves the underlying token",
      run: `@vault:asset(${SDAI})`,
      compile: `@vault:asset!(${SDAI})`,
    },
    {
      name: "totalAssets reads the vault's holdings",
      run: `@vault:totalAssets(${SDAI})`,
      compile: `@vault:totalAssets!(${SDAI})`,
    },
    {
      name: "convertToAssets prices shares in the underlying",
      run: `@vault:convertToAssets(${SDAI} ${ONE})`,
      compile: `@vault:convertToAssets!(${SDAI} ${ONE})`,
    },
    {
      name: "convertToShares prices the underlying in shares",
      run: `@vault:convertToShares(${SDAI} ${ONE})`,
      compile: `@vault:convertToShares!(${SDAI} ${ONE})`,
    },
    {
      name: "maxWithdraw reads an account's withdrawable balance",
      run: `@vault:maxWithdraw(${SDAI} ${HOLDER})`,
      compile: `@vault:maxWithdraw!(${SDAI} ${HOLDER})`,
    },
  ],
});

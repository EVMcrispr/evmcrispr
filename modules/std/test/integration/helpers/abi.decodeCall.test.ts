import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { encodeFunctionData, getAddress, parseAbiItem } from "viem";
import { helpers } from "../../../src/_generated";
import { unverifiedContract } from "../../setup";

// WXDAI: its ABI is served by the mocked api.evmcrispr.com handler in setup.
const wxdai = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
// The burn address can never set a primary ENS name (reverse records must be
// set from the address itself), so it deterministically renders as hex.
const burnAddr = "0x000000000000000000000000000000000000dEaD";
const vitalikAddr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const transferAbi = [parseAbiItem("function transfer(address,uint256)")];
const transferCalldata = (to: string, amount: bigint) =>
  encodeFunctionData({
    abi: transferAbi,
    functionName: "transfer",
    args: [to as `0x${string}`, amount],
  });
const approveCalldata = encodeFunctionData({
  abi: [parseAbiItem("function approve(address,uint256)")],
  args: [burnAddr, 1500000000000000000n],
});
const withdrawCalldata = encodeFunctionData({
  abi: [parseAbiItem("function withdraw(uint256)")],
  args: [123n],
});

describeHelper(
  "@abi.decodeCall",
  {
    describeName: "Std > helpers > @abi.decodeCall(contract, calldata)",
    cases: [
      {
        name: "should decode a transfer via the contract's verified ABI",
        input: `@abi.decodeCall(${wxdai} ${transferCalldata(burnAddr, 10n ** 18n)})`,
        validate: (result) => {
          expect(result).to.deep.equal([
            getAddress(wxdai),
            "transfer(address,uint256)",
            [getAddress(burnAddr), "1e18"],
          ]);
        },
      },
      {
        name: "should compact numbers with a fractional mantissa",
        input: `@abi.decodeCall(${wxdai} ${approveCalldata})`,
        validate: (result) => {
          expect(result[1]).to.equal("approve(address,uint256)");
          expect(result[2][1]).to.equal("1.5e18");
        },
      },
      {
        name: "should keep small numbers as plain decimals",
        input: `@abi.decodeCall(${wxdai} ${withdrawCalldata})`,
        validate: (result) => {
          expect(result[1]).to.equal("withdraw(uint256)");
          expect(result[2]).to.deep.equal(["123"]);
        },
      },
      {
        name: "should render addresses with a primary ENS name as @ens(name)",
        input: `@abi.decodeCall(${wxdai} ${transferCalldata(vitalikAddr, 10n ** 18n)})`,
        validate: (result) => {
          expect(result[2][0]).to.equal("@ens(vitalik.eth)");
        },
      },
      {
        name: "should fall back to openchain when the ABI is unavailable",
        input: `@abi.decodeCall(${unverifiedContract} ${transferCalldata(burnAddr, 10n ** 18n)})`,
        validate: (result) => {
          expect(result).to.deep.equal([
            getAddress(unverifiedContract),
            "transfer(address,uint256)",
            [getAddress(burnAddr), "1e18"],
          ]);
        },
      },
    ],
    docCases: [
      {
        description: "Decode a token transfer",
        code: `set [$to $sig $args] @abi.decodeCall(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d 0xa9059cbb000000000000000000000000000000000000000000000000000000000000dead0000000000000000000000000000000000000000000000000de0b6b3a7640000)\nprint $sig`,
      },
    ],
    errorCases: [
      {
        name: "should fail when the selector cannot be resolved",
        input: `@abi.decodeCall(${unverifiedContract} 0xdeadbeef)`,
        error: "could not resolve selector",
      },
      {
        name: "should fail when the calldata has no selector",
        input: `@abi.decodeCall(${wxdai} 0x01)`,
        error: "too short",
      },
    ],
    sampleArgs: [wxdai, transferCalldata(burnAddr, 10n ** 18n)],
  },
  helpers["abi.decodeCall"].argDefs,
);

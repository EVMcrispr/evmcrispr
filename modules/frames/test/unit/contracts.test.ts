import "../setup";
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { toFunctionSelector } from "viem";
import { compileFrameContract } from "../../scripts/compile";
import {
  frameAccountAbi,
  frameAccountBytecode,
  frameAccountFactoryAbi,
  frameAccountFactoryBytecode,
  frameSponsorAbi,
  frameSponsorBytecode,
} from "../../src/contracts/artifacts";

const source = (name: string) =>
  readFileSync(new URL(`../../contracts/${name}.sol`, import.meta.url), "utf8");

describe("frame > contracts", () => {
  it("the committed bytecode matches a fresh compile", () => {
    const account = compileFrameContract(
      "FrameAccount",
      source("FrameAccount"),
    );
    const sponsor = compileFrameContract(
      "FrameSponsor",
      source("FrameSponsor"),
    );
    const factory = compileFrameContract(
      "FrameAccountFactory",
      source("FrameAccountFactory"),
    );
    expect(factory.bytecode).toBe(frameAccountFactoryBytecode);
    expect(factory.abi).toEqual(frameAccountFactoryAbi as never);
    expect(account.bytecode).toBe(frameAccountBytecode);
    expect(account.abi).toEqual(frameAccountAbi as never);
    expect(sponsor.bytecode).toBe(frameSponsorBytecode);
    expect(sponsor.abi).toEqual(frameSponsorAbi as never);
    // Three solc compiles: about 5.5 s, past the default 5 s.
  }, 30_000);

  it("resolves OpenZeppelin imports and refuses any other source", () => {
    const uses = (path: string) =>
      `// SPDX-License-Identifier: MIT\npragma solidity 0.8.28;\nimport "${path}";\ncontract Probe {}\n`;
    expect(
      compileFrameContract(
        "Probe",
        uses("@openzeppelin/contracts/proxy/Clones.sol"),
      ).bytecode,
    ).toMatch(/^0x[0-9a-f]+$/);
    expect(() =>
      compileFrameContract("Probe", uses("forge-std/Test.sol")),
    ).toThrow(/cannot import "forge-std\/Test.sol"/);
  });

  it("the ABIs expose the spec's functions", () => {
    const selectors = (abi: readonly { type: string }[]) =>
      abi
        .filter((i) => i.type === "function")
        .map((i) => toFunctionSelector(i as never));
    const account = selectors(frameAccountAbi);
    for (const signature of [
      "verify(uint8)",
      "execute(bytes32,bytes)",
      "executeFromExecutor(bytes32,bytes)",
      "installModule(uint256,address,bytes)",
      "isValidSignature(bytes32,bytes)",
      "accountId()",
      "owner()",
    ])
      expect(account).toContain(toFunctionSelector(signature));
    expect(account).toContain("0xb2225351");
    expect(selectors(frameSponsorAbi)).toContain("0xfc735e99");
  });
});

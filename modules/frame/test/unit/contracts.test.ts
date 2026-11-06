import "../setup";
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { compileSolidity } from "@forshtat/hegota-support/solidity";
import { toFunctionSelector } from "viem";
import {
  frameAccountAbi,
  frameAccountBytecode,
  frameSponsorAbi,
  frameSponsorBytecode,
} from "../../src/contracts/artifacts";

const source = (name: string) =>
  readFileSync(new URL(`../../contracts/${name}.sol`, import.meta.url), "utf8");

describe("frame > contracts", () => {
  it("the committed bytecode matches a fresh compile", () => {
    const account = compileSolidity("FrameAccount", source("FrameAccount"), {
      optimizer: true,
    });
    const sponsor = compileSolidity("FrameSponsor", source("FrameSponsor"), {
      optimizer: true,
    });
    expect(account.bytecode).toBe(frameAccountBytecode);
    expect(account.abi).toEqual(frameAccountAbi as never);
    expect(sponsor.bytecode).toBe(frameSponsorBytecode);
    expect(sponsor.abi).toEqual(frameSponsorAbi as never);
  });

  it("FrameAccount refuses high-s signatures and a v other than 27 or 28", () => {
    // secp256k1's n / 2: the largest s of a canonical signature, pushed
    // whole by the compiled check.
    const halfN =
      "7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0";
    expect(frameAccountBytecode.toLowerCase()).toContain(halfN);
    const code = source("FrameAccount");
    expect(code).toMatch(
      /uint256\(s\) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0/,
    );
    expect(code).toMatch(/v == 27 \|\| v == 28/);
  });

  it("the ABIs expose the spec's functions", () => {
    const selectors = (abi: readonly { type: string }[]) =>
      abi
        .filter((i) => i.type === "function")
        .map((i) => toFunctionSelector(i as never));
    expect(selectors(frameAccountAbi)).toContain("0xb2225351");
    expect(selectors(frameSponsorAbi)).toContain("0xfc735e99");
  });
});

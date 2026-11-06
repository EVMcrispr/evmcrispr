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

  it("the ABIs expose the spec's functions", () => {
    const selectors = (abi: readonly { type: string }[]) =>
      abi
        .filter((i) => i.type === "function")
        .map((i) => toFunctionSelector(i as never));
    expect(selectors(frameAccountAbi)).toContain("0xb2225351");
    expect(selectors(frameSponsorAbi)).toContain("0xfc735e99");
  });
});

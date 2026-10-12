import { describe, expect, it } from "bun:test";
import "../../setup.js";

import { withSender } from "@evmcrispr/sdk";
import { evml } from "../../../src";
import { Interpreter } from "../../../src/interpreter/Interpreter";

const ME = "0x1111111111111111111111111111111111111111";
const WHO = "0x2222222222222222222222222222222222222222";
const SAFE = "0x3333333333333333333333333333333333333333";

describe("@sender and the connected account", () => {
  it("follows the account again after a sender block ends", async () => {
    const evm = new Interpreter(evml.registry, { account: ME });
    await evm.interpret("print 1");
    const std = evm.getModule("std")!;
    let inside: string | undefined;
    await withSender(std, SAFE, async () => {
      inside = await evm.getSender();
    });
    expect(inside).toBe(SAFE);
    // `withSender` restored "the previous sender", which was the account
    // itself: that must not pin @sender to it.
    evm.setConnectedAccount(WHO);
    expect(await evm.getSender()).toBe(WHO);
  });

  it("keeps a sender block's account when the account changes inside it", async () => {
    const evm = new Interpreter(evml.registry, { account: ME });
    evm.setSender(SAFE);
    evm.setConnectedAccount(WHO);
    expect(await evm.getSender()).toBe(SAFE);
  });

  it("says how to name an account when none is connected", async () => {
    const evm = new Interpreter(evml.registry, {});
    await expect(evm.getConnectedAccount()).rejects.toThrow(
      "switch --as <address>",
    );
  });
});

import { expect } from "chai";
import { viem } from "hardhat";

import type { PublicClient } from "viem";

import type { Action } from "../../../../src/types";
import { CommandError } from "../../../../src/errors";

import { createInterpreter } from "../../../test-helpers/cas11";
import { expectThrowAsync } from "../../../test-helpers/expects";
import { findStdCommandNode } from "../../../test-helpers/std";

describe("Std > commands > raw <target> <data> [value] [--from <sender>]", () => {
  let client: PublicClient;

  const target = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2"; // Gnosis Safe Factory
  const data =
    "0x1688f0b90000000000000000000000003e5c63644e683549055b9be8653de26e0b4cd36e0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000001843dc407500000000000000000000000000000000000000000000000000000000000000164b63e800d0000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000f48f2b2d2a534e402487b3ee7c18c33aec0fe5e40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000662048b0a591d8f651e956519f6c5e3112626873000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
  const value = "1e18";
  const parsedValue = 1000000000000000000n;
  const from = "0x8790B75CF2bd36A2502a3e48A24338D8288f2F15";

  before(async () => {
    client = await viem.getPublicClient();
  });

  it("should return a correct raw action", async () => {
    const interpreter = createInterpreter(`raw ${target} ${data}`, client);

    const result = await interpreter.interpret();

    const expectedCallAction: Action[] = [
      {
        to: target,
        data,
      },
    ];

    expect(result).eql(expectedCallAction);
  });

  it("should return a correct raw action when value is provided", async () => {
    const interpreter = createInterpreter(
      `raw ${target} ${data} ${value}`,
      client,
    );

    const result = await interpreter.interpret();

    const expectedCallAction: Action[] = [
      {
        to: target,
        data,
        value: parsedValue,
      },
    ];

    expect(result).eql(expectedCallAction);
  });

  it("should return a correct raw action when from address is provided", async () => {
    const interpreter = createInterpreter(
      `raw ${target} ${data} --from ${from}`,
      client,
    );

    const result = await interpreter.interpret();

    const expectedCallAction: Action[] = [
      {
        to: target,
        data,
        from,
      },
    ];

    expect(result).eql(expectedCallAction);
  });

  it("should return a correct raw action when value and from address are provided", async () => {
    const interpreter = createInterpreter(
      `raw ${target} ${data} ${value} --from ${from}`,
      client,
    );

    const result = await interpreter.interpret();

    const expectedCallAction: Action[] = [
      {
        to: target,
        data,
        value: parsedValue,
        from,
      },
    ];

    expect(result).eql(expectedCallAction);
  });

  it("should fail when receiving an invalid target address", async () => {
    const invalidTargetAddress = "false";
    const interpreter = createInterpreter(
      `raw ${invalidTargetAddress} ${data}`,
      client,
    );
    const c = findStdCommandNode(interpreter.ast, "raw")!;
    const error = new CommandError(
      c,
      `expected a valid target address, but got ${invalidTargetAddress}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when receiving an invalid value", async () => {
    const invalidValue = "foo";
    const interpreter = createInterpreter(
      `raw ${target} ${data} ${invalidValue}`,
      client,
    );
    const c = findStdCommandNode(interpreter.ast, "raw")!;
    const error = new CommandError(
      c,
      `expected a valid value, but got ${invalidValue}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when receiving an invalid from address", async () => {
    const invalidFrom = "0xfail";
    const interpreter = createInterpreter(
      `raw ${target} ${data} --from ${invalidFrom}`,
      client,
    );
    const c = findStdCommandNode(interpreter.ast, "raw")!;
    const error = new CommandError(
      c,
      `expected a valid from address, but got ${invalidFrom}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});

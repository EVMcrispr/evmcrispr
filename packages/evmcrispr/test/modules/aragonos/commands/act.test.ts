import { expect } from "chai";
import { viem } from "hardhat";

import type { PublicClient } from "viem";
import { toHex } from "viem";

import { CommandError } from "../../../../src/errors";
import { encodeAction } from "../../../../src/utils";
import { DAO } from "../../../fixtures";
import { itChecksNonDefinedIdentifier } from "../../../test-helpers/evml";
import { expectThrowAsync } from "../../../test-helpers/expects";
import { createTestScriptEncodedAction } from "../test-helpers/actions";
import {
  createAragonScriptInterpreter as _createAragonScriptInterpreter,
  findAragonOSCommandNode,
} from "../test-helpers/aragonos";

describe("AragonOS > commands > act <agent> <targetAddress> <methodSignature> [...params]", () => {
  let client: PublicClient;

  let createAragonScriptInterpreter: ReturnType<
    typeof _createAragonScriptInterpreter
  >;

  before(async () => {
    client = await viem.getPublicClient();

    createAragonScriptInterpreter = _createAragonScriptInterpreter(
      client,
      DAO.kernel,
    );
  });

  it("should return a correct act action", async () => {
    const interpreter = createAragonScriptInterpreter([
      `act agent:1 agent:2 "deposit((uint256,int256),uint256[][])" [1,-2] [[2,3],[4,5]]`,
    ]);

    const actActions = await interpreter.interpret();

    const expectedActActions = [
      createTestScriptEncodedAction(
        [
          encodeAction(
            DAO["agent:2"],
            "function deposit((uint256,int256),uint256[][])",
            [
              [1, -2],
              [
                [2, 3],
                [4, 5],
              ],
            ],
          ),
        ],
        ["agent:1"],
        DAO,
      ),
    ];

    expect(actActions).to.be.eql(expectedActActions);
  });

  it("should return a correct act action when having to implicitly convert any string parameter to bytes when expecting one", async () => {
    const targetAddress = "0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7";
    const params = [
      ["0x02732126661d25c59fd1cc2308ac883b422597fc3103f285f382c95d51cbe667"],
      "QmTik4Zd7T5ALWv5tdMG8m2cLiHmqtTor5QmnCSGLUjLU2",
    ];
    const interpreter = createAragonScriptInterpreter([
      `act agent ${targetAddress} addBatches(bytes32[],bytes) [${params[0].toString()}] ${
        params[1]
      }`,
    ]);

    const actActions = await interpreter.interpret();

    const expectedActActions = [
      createTestScriptEncodedAction(
        [
          encodeAction(targetAddress, "function addBatches(bytes32[],bytes)", [
            params[0],
            toHex("QmTik4Zd7T5ALWv5tdMG8m2cLiHmqtTor5QmnCSGLUjLU2"),
          ]),
        ],
        ["agent"],
        DAO,
      ),
    ];
    expect(actActions).to.be.eql(expectedActActions);
  });

  itChecksNonDefinedIdentifier(
    "should fail when receiving a non-defined agent identifier",
    (nonDefinedIdentifier) =>
      createAragonScriptInterpreter([
        `act ${nonDefinedIdentifier} vault "deposit()"`,
      ]),
    "act",
    0,
    true,
  );

  itChecksNonDefinedIdentifier(
    "should fail when receiving a non-defined target identifier",
    (nonDefinedIdentifier) =>
      createAragonScriptInterpreter([
        `act agent ${nonDefinedIdentifier} "deposit()"`,
      ]),
    "act",
    1,
    true,
  );

  it("should fail when receiving an invalid agent address", async () => {
    const invalidAgentAddress = "false";
    const interpreter = createAragonScriptInterpreter([
      `act ${invalidAgentAddress} agent "deposit()"`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "act")!;
    const error = new CommandError(
      c,
      `expected a valid agent address, but got ${invalidAgentAddress}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when receiving an invalid target address", async () => {
    const invalidTargetAddress = "2.22e18";
    const interpreter = createAragonScriptInterpreter([
      `act agent ${invalidTargetAddress} "deposit()"`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "act")!;
    const error = new CommandError(
      c,
      `expected a valid target address, but got 2220000000000000000`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when receiving an invalid signature", async () => {
    const cases = [
      ["mint", "no parenthesis"],
      ["mint(", "left parenthesis"],
      ["mint)", "right parenthesis"],
      ["mint(uint,)", "right comma"],
      ["mint(,uint)", "left comma"],
      ["mint(uint,uint,())", "empty tuple"],
      ["mint(uint,uint,(uint,))", "right comma in tuple"],
      ["mint(uint,uint,(,uint))", "left comma in tuple"],
    ];

    await Promise.all(
      cases.map(([invalidSignature, msg]) => {
        const interpreter = createAragonScriptInterpreter([
          `act agent agent:2 "${invalidSignature}"`,
        ]);
        const c = findAragonOSCommandNode(interpreter.ast, "act")!;
        const error = new CommandError(
          c,
          `expected a valid signature, but got ${invalidSignature}`,
        );

        return expectThrowAsync(
          () => interpreter.interpret(),
          error,
          `${msg} signature error mismatch`,
        );
      }),
    );
  });

  it("should fail when receiving invalid function params", async () => {
    const paramsErrors = [
      '-param 0 of type address: Address "1000000000000000000" is invalid.\n\n- Address must be a hex value of 20 bytes. Got 1000000000000000000',
      "-param 1 of type uint256: Invalid BigInt value. Got none",
    ];
    const interpreter = createAragonScriptInterpreter([
      `act agent agent:2 "deposit(address,uint256)" 1e18`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "act")!;
    const error = new CommandError(
      c,
      `error when encoding deposit call:\n${paramsErrors.join("\n")}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});

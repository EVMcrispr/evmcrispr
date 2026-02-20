import "../../setup";

import { CommandError, encodeAction } from "@evmcrispr/sdk";
import { describeCommand, expect } from "@evmcrispr/test-utils";
import { toHex } from "viem";
import { DAO } from "../../fixtures";
import { createTestScriptEncodedAction } from "../../test-helpers/actions";
import { findAragonOSCommandNode } from "../../test-helpers/aragonos";

const preamble = `load aragonos --as ar\nar:connect ${DAO.kernel} (`;

describeCommand("act", {
  describeName:
    "AragonOS > commands > act <agent> <targetAddress> <methodSignature> [...params]",
  module: "aragonos",
  preamble,
  cases: [
    {
      name: "should return a correct act action",
      script: `act @app(agent:1) @app(agent:2) "deposit((uint256,int256),uint256[][])" [1,-2] [[2,3],[4,5]]\n)`,
      validate: async (actActions) => {
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
      },
    },
    {
      name: "should return a correct act action when having to implicitly convert any string parameter to bytes when expecting one",
      script: `act @app(agent) 0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7 addBatches(bytes32[],bytes) [0x02732126661d25c59fd1cc2308ac883b422597fc3103f285f382c95d51cbe667] QmTik4Zd7T5ALWv5tdMG8m2cLiHmqtTor5QmnCSGLUjLU2\n)`,
      validate: async (actActions) => {
        const expectedActActions = [
          createTestScriptEncodedAction(
            [
              encodeAction(
                "0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7",
                "function addBatches(bytes32[],bytes)",
                [
                  [
                    "0x02732126661d25c59fd1cc2308ac883b422597fc3103f285f382c95d51cbe667",
                  ],
                  toHex("QmTik4Zd7T5ALWv5tdMG8m2cLiHmqtTor5QmnCSGLUjLU2"),
                ],
              ),
            ],
            ["agent"],
            DAO,
          ),
        ];
        expect(actActions).to.be.eql(expectedActActions);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when receiving an invalid agent address",
      script: `act false @app(agent) "deposit()"\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "act")!;
        return new CommandError(
          c,
          `<agent> must be a valid address, got false`,
        );
      },
    },
    {
      name: "should fail when receiving an invalid target address",
      script: `act @app(agent) 2.22e18 "deposit()"\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "act")!;
        return new CommandError(
          c,
          `<target> must be a valid address, got 2220000000000000000`,
        );
      },
    },
    {
      name: "should fail when receiving invalid function params",
      script: `act @app(agent) @app(agent:2) "deposit(address,uint256)" 1e18\n)`,
      error: (interpreter) => {
        const paramsErrors = [
          '-param 0 of type address: Address "1000000000000000000" is invalid.\n\n- Address must be a hex value of 20 bytes. Got 1000000000000000000',
          "-param 1 of type uint256: Invalid BigInt value. Got none",
        ];
        const c = findAragonOSCommandNode(interpreter.ast, "act")!;
        return new CommandError(
          c,
          `error when encoding deposit call:\n${paramsErrors.join("\n")}`,
        );
      },
    },
    {
      name: "should fail when receiving a non-defined agent identifier",
      script: `act non-defined-address @app(agent) "deposit()"\n)`,
      error: "non-defined-address",
    },
    {
      name: "should fail when receiving a non-defined target identifier",
      script: `act @app(agent) non-defined-address "deposit()"\n)`,
      error: "non-defined-address",
    },
    {
      name: "should fail for signature without parenthesis (mint)",
      script: `act @app(agent) @app(agent:2) "mint"\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "act")!;
        return new CommandError(
          c,
          "<signature> must be a valid function signature, got mint",
        );
      },
    },
    {
      name: "should fail for signature with only left parenthesis (mint()",
      script: `act @app(agent) @app(agent:2) "mint("\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "act")!;
        return new CommandError(
          c,
          "<signature> must be a valid function signature, got mint(",
        );
      },
    },
    {
      name: "should fail for signature with only right parenthesis (mint))",
      script: `act @app(agent) @app(agent:2) "mint)"\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "act")!;
        return new CommandError(
          c,
          "<signature> must be a valid function signature, got mint)",
        );
      },
    },
    {
      name: "should fail for signature with right comma (mint(uint,))",
      script: `act @app(agent) @app(agent:2) "mint(uint,)"\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "act")!;
        return new CommandError(
          c,
          "<signature> must be a valid function signature, got mint(uint,)",
        );
      },
    },
    {
      name: "should fail for signature with left comma (mint(,uint))",
      script: `act @app(agent) @app(agent:2) "mint(,uint)"\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "act")!;
        return new CommandError(
          c,
          "<signature> must be a valid function signature, got mint(,uint)",
        );
      },
    },
    {
      name: "should fail for signature with empty tuple (mint(uint,uint,()))",
      script: `act @app(agent) @app(agent:2) "mint(uint,uint,())"\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "act")!;
        return new CommandError(
          c,
          "<signature> must be a valid function signature, got mint(uint,uint,())",
        );
      },
    },
    {
      name: "should fail for signature with right comma in tuple (mint(uint,uint,(uint,)))",
      script: `act @app(agent) @app(agent:2) "mint(uint,uint,(uint,))"\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "act")!;
        return new CommandError(
          c,
          "<signature> must be a valid function signature, got mint(uint,uint,(uint,))",
        );
      },
    },
    {
      name: "should fail for signature with left comma in tuple (mint(uint,uint,(,uint)))",
      script: `act @app(agent) @app(agent:2) "mint(uint,uint,(,uint))"\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "act")!;
        return new CommandError(
          c,
          "<signature> must be a valid function signature, got mint(uint,uint,(,uint))",
        );
      },
    },
  ],
});

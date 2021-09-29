import { expect } from "chai";
import { ActionInterpreter } from "../src";
import evmcl from "../src/evmcl";
import { APP } from "./fixtures";

let _calls: any[];

const mockFunction = (func: string) => ({
  [func]: (...params: any[]) => {
    _calls.push({ func, params });
    return () => [];
  },
});

const mockCallFunction = (method: string) => ({
  call: (id: string) => ({
    [method]: (...params: any[]) => {
      _calls.push({ func: "call", id, method, params });
      return () => [];
    },
  }),
});

const actionInterpreterMock = {
  ...mockFunction("installNewApp"),
  ...mockFunction("addPermission"),
  ...mockFunction("revokePermission"),
  ...mockCallFunction("newVote"),
  ...mockFunction("act"),
} as unknown as ActionInterpreter;

function check(actions: (evm: ActionInterpreter) => any[], calls: any[]) {
  actions(actionInterpreterMock);
  expect(_calls).to.be.eql(calls);
}

describe("EVM Command Line", () => {
  beforeEach(() => {
    _calls = [];
  });

  it("install token-manager:new param1 param2 param3", () => {
    const params: string = APP.initializeParams.join(" ");
    check(
      evmcl`
        install token-manager:new ${params}
      `,
      [
        {
          func: "installNewApp",
          params: ["token-manager:new", APP.initializeParams.map((p) => p.toString())],
        },
      ]
    );
  });
  it("grant voting token-manager MINT_ROLE", () => {
    check(
      evmcl`
        grant voting token-manager MINT_ROLE
      `,
      [
        {
          func: "addPermission",
          params: [["voting", "token-manager", "MINT_ROLE"], undefined],
        },
      ]
    );
  });
  it("revoke voting token-manager MINT_ROLE", () => {
    check(
      evmcl`
        revoke voting token-manager MINT_ROLE
      `,
      [
        {
          func: "revokePermission",
          params: [["voting", "token-manager", "MINT_ROLE"], undefined],
        },
      ]
    );
  });
  it("exec voting newVote Hello 0x0", () => {
    check(
      evmcl`
        exec voting newVote Hello 0x0
      `,
      [
        {
          func: "call",
          id: "voting",
          method: "newVote",
          params: ["Hello", "0x0"],
        },
      ]
    );
  });
  it("act agent 0x0 deposit(uint) 1", () => {
    check(
      evmcl`
        act agent 0x0 deposit(uint) 1
      `,
      [
        {
          func: "act",
          params: ["agent", "0x0", "deposit(uint)", ["1"]],
        },
      ]
    );
  });
});

import { expect } from "chai";
import { ActionInterpreter, ActionFunction } from "../src";
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

async function check(actions: (evm: ActionInterpreter) => ActionFunction, calls: any[]) {
  await actions(actionInterpreterMock);
  expect(_calls).to.be.deep.eq(calls);
}

describe("EVM Command Line", () => {
  beforeEach(() => {
    _calls = [];
  });

  it("install token-manager:new param1 param2 param3", async () => {
    const params: string = APP.initializeParams.join(" ");
    await check(
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
  it("grant voting token-manager MINT_ROLE", async () => {
    await check(
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
  it("revoke voting token-manager MINT_ROLE", async () => {
    await check(
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
  it("exec voting newVote Hello 0x0", async () => {
    await check(
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
  it("exec voting newVote Hello [0x0,[3,2]]", async () => {
    await check(
      evmcl`
        exec voting newVote Hello [0x0,[3e21,2]]
      `,
      [
        {
          func: "call",
          id: "voting",
          method: "newVote",
          params: ["Hello", ["0x0", ["3e21", "2"]]],
        },
      ]
    );
  });
  it("act agent 0x0 deposit(uint,unit[][]) 1 [[2],[3,4]]", async () => {
    await check(
      evmcl`
        act agent 0x0 deposit(uint,unit[][]) 1 [[2],[3,4]]
      `,
      [
        {
          func: "act",
          params: ["agent", "0x0", "deposit(uint,unit[][])", ["1", [["2"], ["3", "4"]]]],
        },
      ]
    );
  });
});

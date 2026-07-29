import { describe, expect, it } from "bun:test";
import type { HelperFunctionNode, Module, NodesInterpreters } from "../../src";
import { NodeType } from "../../src";
import { defineCommand } from "../../src/utils/defineCommand";
import { defineHelper } from "../../src/utils/defineHelper";

const VALID_ADDRESS = "0x0000000000000000000000000000000000000001";
const VALID_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

function stubModule(types = {}): Module {
  return { types } as unknown as Module;
}

function stubHelperNode(args: any[] = []): HelperFunctionNode {
  return {
    type: NodeType.HelperFunctionExpression,
    name: "test",
    args,
  };
}

const identityInterpreters: NodesInterpreters = {
  interpretNode: async (n: any) => n.value,
  interpretNodes: async (nodes: any[]) => nodes.map((n) => n.value),
};

function literal(value: any) {
  return { type: NodeType.StringLiteral, value };
}

// ---------------------------------------------------------------------------
// Phase 1: helper return type validation
// ---------------------------------------------------------------------------

describe("defineHelper return type validation", () => {
  it("should pass when returnType matches actual return", async () => {
    const helper = defineHelper<Module>({
      name: "good-addr",
      returnType: "address",
      args: [],
      async run() {
        return VALID_ADDRESS;
      },
    });

    const result = await helper(
      stubModule(),
      stubHelperNode(),
      identityInterpreters,
    );
    expect(result).toBe(VALID_ADDRESS);
  });

  it("should throw when returnType is address but run returns non-address", async () => {
    const helper = defineHelper<Module>({
      name: "bad-addr",
      returnType: "address",
      args: [],
      async run() {
        return "not-an-address";
      },
    });

    await expect(
      helper(stubModule(), stubHelperNode(), identityInterpreters),
    ).rejects.toThrow(/return value must be a valid address/);
  });

  it("should throw when returnType is bytes32 but return is wrong length", async () => {
    const helper = defineHelper<Module>({
      name: "bad-b32",
      returnType: "bytes32",
      args: [],
      async run() {
        return "0xdeadbeef";
      },
    });

    await expect(
      helper(stubModule(), stubHelperNode(), identityInterpreters),
    ).rejects.toThrow(/return value must be a bytes32/);
  });

  it("should skip validation when returnType is 'any'", async () => {
    const helper = defineHelper<Module>({
      name: "any-ret",
      returnType: "any",
      args: [],
      async run() {
        return 42 as any;
      },
    });

    const result = await helper(
      stubModule(),
      stubHelperNode(),
      identityInterpreters,
    );
    expect(result).toBe(42 as any);
  });

  it("should skip validation when returnType is omitted", async () => {
    const helper = defineHelper<Module>({
      name: "no-ret",
      args: [],
      async run() {
        return "anything";
      },
    });

    const result = await helper(
      stubModule(),
      stubHelperNode(),
      identityInterpreters,
    );
    expect(result).toBe("anything");
  });

  it("should pass for valid number return", async () => {
    const { Num } = await import("../../src/utils/Num");
    const helper = defineHelper<Module>({
      name: "num-ret",
      returnType: "number",
      args: [],
      async run() {
        return Num.fromBigInt(42n);
      },
    });

    const result = await helper(
      stubModule(),
      stubHelperNode(),
      identityInterpreters,
    );
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 2: auto-derived runtime type resolution for rest args after ABI args
// ---------------------------------------------------------------------------

describe("defineCommand auto ABI type resolution", () => {
  it("should validate rest args against signature-derived types", async () => {
    const command = defineCommand<Module>({
      name: "test-exec",
      args: [
        { name: "target", type: "address" },
        { name: "sig", type: "write-abi" },
        { name: "params", type: "any", rest: true },
      ],
      async run() {
        return [];
      },
    });

    const node = {
      type: NodeType.CommandExpression,
      name: "test-exec",
      module: "",
      args: [
        literal(VALID_ADDRESS),
        literal("transfer(address,uint256)"),
        literal(VALID_ADDRESS),
        literal("not-a-number"),
      ],
      opts: [],
    } as any;

    await expect(
      command.run(stubModule(), node, identityInterpreters),
    ).rejects.toThrow(/must be a number/);
  });

  it("should pass when rest args match signature types", async () => {
    const { Num } = await import("../../src/utils/Num");
    const command = defineCommand<Module>({
      name: "test-exec",
      args: [
        { name: "target", type: "address" },
        { name: "sig", type: "write-abi" },
        { name: "params", type: "any", rest: true },
      ],
      async run() {
        return [];
      },
    });

    const node = {
      type: NodeType.CommandExpression,
      name: "test-exec",
      module: "",
      args: [
        literal(VALID_ADDRESS),
        literal("transfer(address,uint256)"),
        literal(VALID_ADDRESS),
        literal(Num.fromBigInt(100n)),
      ],
      opts: [],
    } as any;

    const result = await command.run(stubModule(), node, identityInterpreters);
    expect(result).toEqual([]);
  });

  it("should skip validation when no ABI arg precedes rest", async () => {
    const command = defineCommand<Module>({
      name: "test-any",
      args: [{ name: "params", type: "any", rest: true }],
      async run() {
        return [];
      },
    });

    const node = {
      type: NodeType.CommandExpression,
      name: "test-any",
      module: "",
      args: [literal("anything"), literal(42), literal(true)],
      opts: [],
    } as any;

    const result = await command.run(stubModule(), node, identityInterpreters);
    expect(result).toEqual([]);
  });

  it("should validate address params from signature", async () => {
    const command = defineCommand<Module>({
      name: "test-addr",
      args: [
        { name: "sig", type: "write-abi" },
        { name: "params", type: "any", rest: true },
      ],
      async run() {
        return [];
      },
    });

    const node = {
      type: NodeType.CommandExpression,
      name: "test-addr",
      module: "",
      args: [literal("approve(address)"), literal("not-an-address")],
      opts: [],
    } as any;

    await expect(
      command.run(stubModule(), node, identityInterpreters),
    ).rejects.toThrow(/must be a valid address/);
  });
});

// ---------------------------------------------------------------------------
// defineHelper auto ABI type resolution for rest args
// ---------------------------------------------------------------------------

describe("defineHelper auto ABI type resolution", () => {
  it("should validate rest args against ABI-derived types", async () => {
    const helper = defineHelper<Module>({
      name: "test-get",
      returnType: "any",
      args: [
        { name: "sig", type: "write-abi" },
        { name: "params", type: "any", rest: true },
      ],
      async run(_m, { sig: _sig, params }) {
        return params;
      },
    });

    const node = stubHelperNode([
      literal("balanceOf(address)"),
      literal("not-an-address"),
    ]);

    await expect(
      helper(stubModule(), node, identityInterpreters),
    ).rejects.toThrow(/must be a valid address/);
  });
});

// ---------------------------------------------------------------------------
// bytes32 arg coercion: integers left-pad like Solidity bytes32(uint256(...))
// ---------------------------------------------------------------------------

describe("bytes32 arg coercion", () => {
  function bytes32Helper() {
    return defineHelper<Module>({
      name: "test-slot",
      returnType: "bytes32",
      args: [{ name: "slot", type: "bytes32" }],
      async run(_m, { slot }) {
        return slot;
      },
    });
  }

  it("should left-pad a Num to 32 bytes", async () => {
    const { Num } = await import("../../src/utils/Num");
    const result = await bytes32Helper()(
      stubModule(),
      stubHelperNode([literal(Num.fromBigInt(1n))]),
      identityInterpreters,
    );
    expect(result).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    );
  });

  it("should left-pad a bigint to 32 bytes", async () => {
    const result = await bytes32Helper()(
      stubModule(),
      stubHelperNode([literal(255n)]),
      identityInterpreters,
    );
    expect(result).toBe(
      "0x00000000000000000000000000000000000000000000000000000000000000ff",
    );
  });

  it("should wrap negative integers two's-complement", async () => {
    const { Num } = await import("../../src/utils/Num");
    const result = await bytes32Helper()(
      stubModule(),
      stubHelperNode([literal(Num.fromBigInt(-1n))]),
      identityInterpreters,
    );
    expect(result).toBe(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    );
  });

  it("should still reject short hex strings", async () => {
    await expect(
      bytes32Helper()(
        stubModule(),
        stubHelperNode([literal("0x01")]),
        identityInterpreters,
      ),
    ).rejects.toThrow(/must be a bytes32/);
  });

  it("should still reject non-integer Nums", async () => {
    const { Num } = await import("../../src/utils/Num");
    await expect(
      bytes32Helper()(
        stubModule(),
        stubHelperNode([literal(Num("1.5"))]),
        identityInterpreters,
      ),
    ).rejects.toThrow(/must be a bytes32/);
  });

  it("should pass a full-width hex string through unchanged", async () => {
    const result = await bytes32Helper()(
      stubModule(),
      stubHelperNode([literal(VALID_BYTES32)]),
      identityInterpreters,
    );
    expect(result).toBe(VALID_BYTES32);
  });
});

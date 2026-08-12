import {
  coerceArgType,
  defineHelper,
  ErrorException,
  NodeType,
} from "@evmcrispr/sdk";
import {
  compileOperand,
  concatParam,
  hashParamOf,
  isBangHelperNode,
  materializeWord,
  rawParam,
  toWord,
  wordOpParam,
  wordPartParam,
} from "@evmcrispr/sdk/onchain";
import type { Address, Hex } from "viem";
import { getAddress, getContractAddress, keccak256, pad } from "viem";
import type Proxies from "..";
import { ARACHNID_CREATE2, cloneInitCode } from "../utils";

const isLive = (n: { type: NodeType } | undefined) =>
  !!n && (n.type === NodeType.CallExpression || isBangHelperNode(n));

export default defineHelper<Proxies>({
  name: "predictClone",
  description:
    "Predicted address of a deterministic ERC-1167 clone deployed with proxies:clone --salt. Pure computation, no chain read.",
  compileDescription:
    "The salt may be a live value (a counter or registry read); the implementation and deployer shape the creation code and must be constants.",
  returnType: "address",
  args: [
    {
      name: "implementation",
      type: "address",
      description: "Implementation contract the clone delegates to",
    },
    { name: "salt", type: "bytes32", description: "CREATE2 salt" },
    {
      name: "deployer",
      type: "address",
      description: "CREATE2 factory (defaults to the Arachnid deployer)",
      optional: true,
    },
  ],
  async run(_module, { implementation, salt, deployer }) {
    return getContractAddress({
      opcode: "CREATE2",
      from: (deployer as Address | undefined) ?? ARACHNID_CREATE2,
      salt: pad(salt as Hex, { size: 32 }),
      bytecode: cloneInitCode(implementation as Address),
    });
  },
  // CREATE2: keccak(0xff . deployer . salt . keccak(initcode)) masked to
  // its low 160 bits. Everything but the salt folds at composition, so a
  // live salt costs one concat, one hash and one mask.
  compile: async (ctx, node) => {
    const [implNode, saltNode, deployerNode] = node.args;
    if (isLive(implNode) || isLive(deployerNode)) {
      throw new ErrorException(
        "@predictClone! implementation and deployer must be constants — they shape the creation code",
      );
    }
    const implementation = getAddress(
      String(await ctx.interpreters.interpretNode(implNode)),
    );
    const deployer =
      deployerNode === undefined
        ? ARACHNID_CREATE2
        : getAddress(
            String(await ctx.interpreters.interpretNode(deployerNode)),
          );
    if (!isLive(saltNode)) {
      const salt = pad(
        String(
          coerceArgType(
            await ctx.interpreters.interpretNode(saltNode),
            "bytes32",
          ),
        ) as Hex,
        { size: 32 },
      );
      return {
        kind: "const",
        cat: "Address",
        value: getContractAddress({
          opcode: "CREATE2",
          from: deployer,
          salt,
          bytecode: cloneInitCode(implementation),
        }),
      };
    }
    const o = await compileOperand(ctx, saltNode);
    if (o.kind !== "call") {
      throw new ErrorException(
        "@predictClone! could not compile the salt — pass it as a plain constant",
      );
    }
    const digest = hashParamOf(
      ctx,
      concatParam(ctx, [
        `0xff${deployer.slice(2)}` as Hex,
        { param: wordPartParam(ctx, materializeWord(ctx, o)), size: 32 },
        keccak256(cloneInitCode(implementation)),
      ]),
    );
    return {
      kind: "call",
      param: wordOpParam(
        ctx,
        "bitAnd",
        false,
        digest,
        rawParam(toWord((1n << 160n) - 1n)),
      ),
      cat: "Address",
    };
  },
});

import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import {
  chainParam,
  coreCall,
  encodeOperator,
  encodeOpRead,
  OP_SELECTORS,
  opsCall,
  requireChainArg,
} from "@evmcrispr/sdk/onchain";
import { getAddress, isAddress, keccak256 } from "viem";
import type Assertions from "..";

export default defineHelper<Assertions>({
  name: "codehash",
  batchable: false,
  description:
    "Read the code hash of an address with EXTCODEHASH semantics: `bytes32(0)` for a nonexistent account (zero nonce, balance and code), `keccak256` of the code otherwise. Plain @codehash reads at script build time; @codehash! reads on-chain at assertion time, and its account can be a `::` call resolving to an address, such as a proxy implementation.",
  returnType: "bytes32",
  args: [
    {
      name: "address",
      type: "address",
      description:
        "Address to read (in @codehash! also a `::` call resolving to one)",
    },
  ],
  async run(module, { address }) {
    const client = await module.getClient();
    const code = await client.getCode({ address });
    if (code && code !== "0x") return keccak256(code);
    // EXTCODEHASH distinguishes an existing code-less account (keccak256(""))
    // from a nonexistent one per EIP-161 (bytes32(0)).
    const [nonce, balance] = await Promise.all([
      client.getTransactionCount({ address }),
      client.getBalance({ address }),
    ]);
    if (nonce === 0 && balance === 0n)
      return "0x0000000000000000000000000000000000000000000000000000000000000000";
    return keccak256("0x");
  },
  compile: async (ctx, node): Promise<Operand> => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@codehash! expects (account), e.g. @codehash!(@me) or @codehash!($proxy::implementation())",
      );
    }
    const [accountNode] = node.args;

    if (accountNode.type === NodeType.CallExpression) {
      // Runtime account: the core's read splices the resolved address
      // word into codehash(address).
      const chain = await requireChainArg(ctx, "codehash!", accountNode);
      const out = chain.lastAbi.outputs?.[0];
      if (chain.lastAbi.outputs?.length !== 1 || out?.type !== "address") {
        throw new ErrorException(
          "@codehash! account call must return a single address",
        );
      }
      return coreCall(
        ctx,
        encodeOpRead(ctx.operators, OP_SELECTORS.codehash, [
          chainParam(ctx, chain),
        ]),
        "Bytes32",
      );
    }

    const account = await ctx.interpreters.interpretNode(accountNode);
    if (typeof account !== "string" || !isAddress(account)) {
      throw new ErrorException(
        `@codehash! account must resolve to an address, got ${account}`,
      );
    }
    // Composition-time account: plain codehash(account) calldata pointed
    // straight at the Operators contract.
    return opsCall(
      ctx,
      encodeOperator("codehash", [getAddress(account)]),
      "Bytes32",
    );
  },
});

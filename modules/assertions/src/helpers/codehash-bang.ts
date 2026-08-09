import { ErrorException, NodeType } from "@evmcrispr/sdk";
import { getAddress, isAddress } from "viem";
import type { Operand } from "../lib/compiler";
import {
  chainParam,
  coreCall,
  opsCall,
  requireChainArg,
} from "../lib/compiler";
import { encodeOpRead } from "../lib/core";
import { encodeOperator, OP_SELECTORS } from "../lib/operators";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "codehash!",
  description:
    "The EXTCODEHASH of an account, read on-chain at assertion time: `bytes32(0)` for a nonexistent account, `keccak256` of the code otherwise. The account can be a `::` call resolving to an address, such as a proxy implementation.",
  returnType: "bytes32",
  args: [
    {
      name: "account",
      type: "address",
      description: "Account address, or a `::` call resolving to one",
    },
  ],
  compileAssert: async (ctx, node): Promise<Operand> => {
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

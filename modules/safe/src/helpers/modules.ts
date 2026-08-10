import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import {
  arrayWordsParam,
  lenParam,
  lensedDataOperand,
  staticCallParam,
} from "@evmcrispr/sdk/onchain";
import { encodeFunctionData } from "viem";
import type Safe from "..";
import { SENTINEL } from "../addresses";
import { getModules, safeAbi } from "../utils";

/** Default getModulesPaginated page size of the on-chain face — matches
 *  the off-chain pagination stride and comfortably covers real Safes. */
const DEFAULT_PAGE_SIZE = 100n;

export default defineHelper<Safe>({
  name: "modules",
  description: "Enabled module addresses of a Safe.",
  compileDescription:
    "Reads one `getModulesPaginated` page, so a Safe with more modules than `pageSize` (default 100) is truncated.",
  returnType: "array",
  batchable: false,
  args: [
    {
      name: "safe",
      type: "address",
      optional: true,
      description:
        "Safe address (defaults to the context Safe or connected account)",
    },
    {
      name: "pageSize",
      type: "number",
      optional: true,
      description:
        "Page size of the single `getModulesPaginated` page the on-chain face reads (default 100)",
    },
  ],
  async run(module, { safe }) {
    return getModules(await module.getClient(), await module.resolveSafe(safe));
  },
  compile: async (ctx, node) => {
    const explicit = node.args[0]
      ? String(await ctx.interpreters.interpretNode(node.args[0]))
      : undefined;
    const safe = await (ctx.module as Safe).resolveSafe(explicit as never);
    let pageSize = DEFAULT_PAGE_SIZE;
    if (node.args[1]) {
      const raw = await ctx.interpreters.interpretNode(node.args[1]);
      pageSize = raw instanceof Num ? raw.toBigInt() : BigInt(String(raw));
      if (pageSize <= 0n) {
        throw new ErrorException("@modules! pageSize must be positive");
      }
    }
    const param = staticCallParam(
      safe,
      encodeFunctionData({
        abi: safeAbi,
        functionName: "getModulesPaginated",
        args: [SENTINEL, pageSize],
      }),
    );
    const outputs = [{ type: "address[]" }, { type: "address" }] as const;
    // nav to the array component, then the array-face representation:
    // the live words payload with the count from a LEN-sentinel nav.
    return {
      kind: "call",
      param: arrayWordsParam(
        ctx,
        lensedDataOperand(ctx, { param, outputs, path: [0] }),
        lenParam(ctx, param, outputs, [0]),
      ),
      cat: "Bytes",
    };
  },
});

import { getChainNativeCurrency, resolveToken } from "@evmcrispr/module-std";
import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import {
  compileOperand,
  isLiveArg,
  materializeWord,
  opReadParam,
  opSelector,
  rawParam,
  readTarget,
  targetCallParam,
  toWord,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import {
  parseAbiItem,
  parseUnits,
  toFunctionSelector,
  zeroAddress,
} from "viem";
import type Token from "..";

export default defineHelper<Token>({
  name: "amount",
  description:
    "Convert a human-readable token amount to its base unit (applying decimals).",
  compileDescription:
    "Scales against a live `decimals()` read rather than a build-time constant.",
  returnType: "number",
  args: [
    {
      name: "tokenSymbolOrAddress",
      type: "token-symbol",
      description: "Token symbol (e.g. `DAI`) or address",
    },
    { name: "amount", type: "number", description: "Human-readable amount" },
  ],
  async run(module, { tokenSymbolOrAddress, amount }) {
    const tokenAddr = await resolveToken(module, tokenSymbolOrAddress);

    if (tokenAddr === zeroAddress) {
      const chain = await module.getChain();
      const { decimals } = getChainNativeCurrency(chain);
      return parseUnits(String(amount), decimals).toString();
    }

    const client = await module.getClient();
    const decimals = await client.readContract({
      address: tokenAddr,
      abi: [parseAbiItem("function decimals() view returns (uint8)")],
      functionName: "decimals",
    });
    return parseUnits(String(amount), decimals).toString();
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@amount! expects (token amount), e.g. @amount!(DAI 1.5)",
      );
    }
    const token = await readTarget(ctx, "amount!", node.args[0], (value) =>
      resolveToken(ctx.module, String(value)),
    );
    const decimalsOf = () =>
      targetCallParam(ctx, token, toFunctionSelector("function decimals()"));
    if (isLiveArg(node.args[1])) {
      // A live amount is a whole number of tokens read when the assertion
      // runs: base units are mul(amount, exp(10, decimals)).
      const live = await compileOperand(ctx, node.args[1]);
      if (live.kind !== "const") {
        if (live.cat !== "Uint") {
          throw new ErrorException(
            `@amount! live amount must resolve to an unsigned integer, got a ${live.cat} value`,
          );
        }
        if (token === zeroAddress) {
          const chain = await ctx.module.getChain();
          const { decimals } = getChainNativeCurrency(chain);
          return {
            kind: "call",
            param: wordOpParam(
              ctx,
              "mul",
              false,
              materializeWord(ctx, live),
              rawParam(toWord(10n ** BigInt(decimals))),
            ),
            cat: "Uint",
          };
        }
        const scale = opReadParam(ctx, opSelector("exp"), [
          rawParam(toWord(10n)),
          decimalsOf(),
        ]);
        return {
          kind: "call",
          param: wordOpParam(
            ctx,
            "mul",
            false,
            materializeWord(ctx, live),
            scale,
          ),
          cat: "Uint",
        };
      }
    }
    const amount = String(
      await ctx.interpreters.interpretNode(node.args[1]),
    ).trim();
    if (!/^\d+(\.\d+)?$/.test(amount)) {
      throw new ErrorException(
        `@amount! amount must be a non-negative decimal number, got ${amount}`,
      );
    }
    if (token === zeroAddress) {
      // The native token's decimals are a chain constant: fold fully.
      const chain = await ctx.module.getChain();
      const { decimals } = getChainNativeCurrency(chain);
      return {
        kind: "const",
        cat: "Uint",
        value: Num.fromBigInt(parseUnits(amount, decimals)),
      };
    }
    // amount = mantissa / 10^k: base units are
    // mul(mantissa, exp(10, decimals - k)) against the LIVE decimals
    // read — reverts at assertion time if the token has fewer than k
    // decimals (no silent truncation).
    const [whole, fraction = ""] = amount.split(".");
    const trimmed = fraction.replace(/0+$/, "");
    const mantissa = BigInt(whole + trimmed);
    const k = BigInt(trimmed.length);
    const decimalsParam = decimalsOf();
    const exponent =
      k === 0n
        ? decimalsParam
        : wordOpParam(ctx, "sub", false, decimalsParam, rawParam(toWord(k)));
    const scale = opReadParam(ctx, opSelector("exp"), [
      rawParam(toWord(10n)),
      exponent,
    ]);
    return {
      kind: "call",
      param: wordOpParam(ctx, "mul", false, rawParam(toWord(mantissa)), scale),
      cat: "Uint",
    };
  },
});

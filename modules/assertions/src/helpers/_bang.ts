import type { HelperConfig } from "@evmcrispr/sdk";
import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Assertions from "..";

/**
 * Define an on-chain (`!`-suffixed) helper. These helpers never run
 * off-chain: the `assertions:assert` compiler intercepts their raw AST
 * nodes and compiles them to combinator calldata evaluated at assertion
 * time. The registration here exists for completions, hover docs, and a
 * clear error when one is used outside an assertion.
 */
export function defineBangHelper(
  config: Omit<HelperConfig<Assertions>, "run">,
) {
  return defineHelper<Assertions>({
    ...config,
    async run() {
      throw new ErrorException(
        `@${config.name} evaluates on-chain and is only valid inside an assertions:assert expression`,
      );
    },
  });
}

import { defineErrors } from "@evmcrispr/sdk";

/**
 * The one refusal `@token:holdings` documents: the chain has no explorer
 * that could list what an address holds, so no script on that chain will
 * ever get an answer. An explorer that is down, answers with an error or
 * returns something else than a token list is an outage, not a refusal:
 * those stay ordinary failures and stop the script, because treating them
 * as "holds nothing" would silently sell nothing, or everything else.
 */
export const HOLDINGS_ERRORS = defineErrors({
  NoExplorer: {
    description: "The chain has no explorer that can list an account's tokens",
    fields: [
      {
        name: "chainId",
        type: "number",
        description: "Chain that was asked",
      },
    ],
  },
});

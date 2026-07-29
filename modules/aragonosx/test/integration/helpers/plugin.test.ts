import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import {
  DAO_ADDRESS,
  MULTISIG_PLUGIN_2,
  PREAMBLE,
  SET_BINDINGS,
  TOKEN_VOTING_PLUGIN,
} from "../../fixtures";

describeHelper("@aragonosx:plugin", {
  module: "aragonosx",
  preamble: `${SET_BINDINGS}\naragonosx:connect ${DAO_ADDRESS} (\nset $tv @aragonosx:plugin("token-voting")\nset $ms @aragonosx:plugin(multisig 1)\n)`,
  cases: [
    {
      name: "resolves a plugin identifier within the connected DAO",
      input: "$tv",
      expected: TOKEN_VOTING_PLUGIN,
    },
    {
      name: "resolves repeated installs with an index argument",
      input: "$ms",
      expected: MULTISIG_PLUGIN_2,
    },
  ],
  errorCases: [
    {
      name: "fails outside a connect block",
      input: '@aragonosx:plugin("token-voting")',
      error: 'used within a "connect" command',
    },
  ],
  skipArgLengthCheck: true,
  docCases: [
    {
      description: "Resolve the token-voting plugin address",
      preamble: PREAMBLE,
      code: `aragonosx:connect 0x2222222222222222222222222222222222222222 (
  set $votingPlugin @aragonosx:plugin("token-voting")
  print $votingPlugin
)`,
    },
  ],
});

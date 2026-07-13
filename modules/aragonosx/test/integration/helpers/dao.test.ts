import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import {
  DAO_ADDRESS,
  DAO_SUBDOMAIN,
  PREAMBLE,
  SET_BINDINGS,
} from "../../fixtures";

describeHelper("@aragonosx:dao", {
  module: "aragonosx",
  preamble: `${SET_BINDINGS}\naragonosx:connect ${DAO_ADDRESS} (\nset $current @aragonosx:dao()\nset $byName @aragonosx:dao("${DAO_SUBDOMAIN}")\n)`,
  cases: [
    {
      name: "resolves the connected DAO",
      input: "$current",
      expected: DAO_ADDRESS,
    },
    {
      name: "resolves a connected DAO by subdomain",
      input: "$byName",
      expected: DAO_ADDRESS,
    },
  ],
  errorCases: [
    {
      name: "fails outside a connect block",
      input: "@aragonosx:dao()",
      error: 'used within a "connect" command',
    },
  ],
  skipArgLengthCheck: true,
  docCases: [
    {
      description: "Use the DAO address inside a proposal action",
      preamble: PREAMBLE,
      code: `aragonosx:connect 0x2222222222222222222222222222222222222222 (
  set $treasury @aragonosx:dao()
  print $treasury
)`,
    },
  ],
});

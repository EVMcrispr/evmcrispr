import "../../setup";
import { BindingsSpace } from "@evmcrispr/sdk";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand, describeHelper } from "@evmcrispr/test-utils/evml";
import { concatHex, getContractAddress, isAddress, pad } from "viem";
import { helpers } from "../../../src/_generated";
import { ARACHNID_CREATE2, cloneInitCode } from "../../../src/utils";
import { GNO } from "../../fixtures";

const SALT =
  "0x0000000000000000000000000000000000000000000000000000000000000abc" as const;
const PADDED_SALT = pad(SALT, { size: 32 });
const INIT_CODE = cloneInitCode(GNO);
const PREDICTED = getContractAddress({
  opcode: "CREATE2",
  from: ARACHNID_CREATE2,
  salt: PADDED_SALT,
  bytecode: INIT_CODE,
});

describeCommand("clone", {
  describeName:
    "Proxies > commands > clone $variable <implementation> [--salt]",
  module: "proxies",
  preamble: "load proxies",
  cases: [
    {
      name: "should deploy a deterministic clone through the CREATE2 factory",
      script: `proxies:clone $clone ${GNO} --salt ${SALT}`,
      expectedActions: [
        {
          to: ARACHNID_CREATE2,
          data: concatHex([PADDED_SALT, INIT_CODE]),
          from: TEST_ACCOUNT_ADDRESS,
        },
      ],
      validate: (_result, interpreter) => {
        expect(interpreter.getBinding("$clone", BindingsSpace.USER)).to.equal(
          PREDICTED,
        );
      },
    },
    {
      name: "should deploy a plain CREATE clone and bind the predicted address",
      script: `proxies:clone $clone ${GNO}`,
      validate: (result, interpreter) => {
        expect(result).to.have.length(1);
        expect((result[0] as any).to).to.be.undefined;
        expect((result[0] as any).data).to.equal(INIT_CODE);
        const bound = interpreter.getBinding("$clone", BindingsSpace.USER);
        expect(isAddress(bound as string)).to.be.true;
      },
    },
  ],
  errorCases: [
    {
      name: "should reject plain CREATE clones inside a batch",
      script: `batch (
  proxies:clone $clone ${GNO}
)`,
      error: "cannot be batched",
    },
  ],
});

describeHelper(
  "@proxies:predictClone",
  {
    describeName:
      "Proxies > helpers > @proxies:predictClone(implementation salt [deployer])",
    module: "proxies",
    cases: [
      {
        name: "should predict the deterministic clone address",
        input: `@proxies:predictClone(${GNO} ${SALT})`,
        expected: PREDICTED,
      },
    ],
    sampleArgs: [GNO, SALT, ARACHNID_CREATE2],
  },
  helpers.predictClone.argDefs,
);

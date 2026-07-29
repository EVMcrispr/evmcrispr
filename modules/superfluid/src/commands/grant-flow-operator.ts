import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Superfluid from "..";
import { cfaForwarder } from "../addresses";
import { PERM_FULL, parsePermissions } from "../utils/acl";
import { requireCore } from "../utils/protocol";
import { INT96_MAX, parseFlowRate } from "../utils/rate";
import { resolveSuperToken } from "../utils/supertoken";

export default defineCommand<Superfluid>({
  name: "grant-flow-operator",
  description:
    "Let an operator manage your streams of a SuperToken. Defaults to full control (create, update, delete) with unlimited flow-rate allowance; restrict with --permissions and --allowance. The allowance is a decrementing budget consumed by creates and rate increases.",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "operator", type: "address", description: "Flow operator" },
  ],
  opts: [
    {
      name: "permissions",
      type: "string",
      description:
        '`full` (default) or a quoted comma-separated set like "create,delete"',
    },
    {
      name: "allowance",
      type: "number",
      description:
        "Flow-rate allowance in wei per second (e.g. 5000e18/mo); defaults to unlimited",
    },
  ],
  completions: {
    to: () => [fieldItem("to")],
    permissions: () => [
      fieldItem("full"),
      fieldItem('"create,update,delete"'),
      fieldItem('"create,delete"'),
    ],
  },
  async run(module, { token, to, operator }, { opts }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const chainId = await requireCore(module);
    const forwarder = cfaForwarder(chainId);
    const superToken = await resolveSuperToken(module, token);
    const permissions = parsePermissions(opts.permissions);
    const allowance =
      opts.allowance === undefined
        ? INT96_MAX
        : parseFlowRate(opts.allowance, "--allowance");

    if (permissions === PERM_FULL && allowance === INT96_MAX) {
      return [
        encodeAction(forwarder, "grantPermissions(address,address)", [
          superToken,
          operator,
        ]),
      ];
    }

    return [
      encodeAction(
        forwarder,
        "updateFlowOperatorPermissions(address,address,uint8,int96)",
        [
          superToken,
          operator,
          Num.fromBigInt(BigInt(permissions)),
          Num.fromBigInt(allowance),
        ],
      ),
    ];
  },
});

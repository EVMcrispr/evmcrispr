import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import { amountParam, getSmartCompileContext } from "@evmcrispr/sdk/onchain";
import type { Abi } from "viem";
import type Superfluid from "..";
import { cfaForwarderAbi } from "../abis";
import { cfaForwarder } from "../addresses";
import { requireCore } from "../utils/protocol";
import { parseFlowRate } from "../utils/rate";
import { resolveSuperToken } from "../utils/supertoken";

export default defineCommand<Superfluid>({
  smartSupport: { kind: "runtime" },
  name: "stream",
  description:
    "Open a money stream of a SuperToken to a receiver, or retarget an existing one to the new rate (idempotent). Rates are wei per second — use a rate literal like 1000e18/mo. Opening a stream locks a buffer deposit (hours of streaming) that is refunded when the stream stops.",
  args: [
    {
      name: "rate",
      type: "number",
      runtime: true,
      description: "Flow rate in wei per second, e.g. 1000e18/mo",
    },
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    {
      name: "receiver",
      type: "address",
      runtime: true,
      description: "Stream receiver",
    },
  ],
  opts: [
    {
      name: "from",
      type: "address",
      runtime: true,
      description:
        "Stream sender when acting as a flow operator (requires prior grant-flow-operator by the sender)",
    },
    {
      name: "user-data",
      type: "bytes",
      runtime: true,
      description: "Arbitrary user data forwarded to stream hooks",
    },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(module, { rate, token, to, receiver }, { opts }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const chainId = await requireCore(module);
    const forwarder = cfaForwarder(chainId);
    const superToken = await resolveSuperToken(module, token);
    const flowRate = parseFlowRate(rate, "<rate>", module);
    const userData = opts["user-data"] ?? "0x";

    const account = await module.getSender();
    const sender = opts.from ?? account;

    // setFlowrate only acts for msg.sender and takes no user data; the
    // explicit create/update pair covers the operator and user-data cases.
    if (opts.from === undefined && opts["user-data"] === undefined) {
      return [
        encodeAction(forwarder, "setFlowrate(address,address,int96)", [
          superToken,
          receiver,
          amountParam(flowRate),
        ]),
      ];
    }

    if (getSmartCompileContext(module))
      throw new ErrorException(
        "stream with --from or --user-data chooses create/update from build-time state; use exec with an explicit createFlow or updateFlow ABI inside a smart batch",
      );
    const client = await module.getClient();
    const current = (await client.readContract({
      address: forwarder,
      abi: cfaForwarderAbi as Abi,
      functionName: "getFlowrate",
      args: [superToken, sender, receiver],
    })) as bigint;

    const fn =
      current === 0n
        ? "createFlow(address,address,address,int96,bytes)"
        : "updateFlow(address,address,address,int96,bytes)";
    return [
      encodeAction(forwarder, fn, [
        superToken,
        sender,
        receiver,
        amountParam(flowRate),
        userData,
      ]),
    ];
  },
});

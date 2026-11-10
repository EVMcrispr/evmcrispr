import type { Action } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { buildApprovalActions } from "@evmcrispr/sdk/onchain";
import type { Address } from "viem";
import { encodeFunctionData } from "viem";
import type Ens from "..";
import {
  defaultPaymentTokenMap,
  ethRegistrarMap,
  ethRenewerV1Map,
  requireAddress,
} from "../addresses";
import { NO_REFERRER, renewerAbi } from "../ethRegistrar";
import { assertSupportedChain, eth2LDLabel } from "../utils";

export default defineCommand<Ens>({
  smartSupport: {
    kind: "static",
    reason:
      "Each name is routed to its renewer and priced in the payment token when the script is built.",
  },
  name: "renew",
  description:
    "Renew .eth names, paid in an ERC-20 (USDC by default): ENSv2 names on the ETHRegistrar, names still on ENS v1 on ETHRenewerV1, each with one approval and one batch.",
  args: [
    {
      name: "domains",
      type: ["string", "array"],
      description: "ENS label(s) or names to renew",
    },
    {
      name: "duration",
      type: "number",
      description: "Renewal duration, in time units (e.g. 1y)",
    },
  ],
  opts: [
    {
      name: "payment-token",
      type: "address",
      description:
        "ERC-20 the renewal is paid in, from the sender: USDC (default) or DAI",
    },
  ],
  async run(module, { domains, duration }, { opts }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const renewers = [
      requireAddress(ethRegistrarMap, chainId, "ETHRegistrar"),
      requireAddress(ethRenewerV1Map, chainId, "ETHRenewerV1"),
    ];
    const paymentToken: Address =
      opts["payment-token"] ??
      requireAddress(defaultPaymentTokenMap, chainId, "USDC");
    const labels = (Array.isArray(domains) ? domains : [domains]).map(
      (name: string) => (name.includes(".") ? eth2LDLabel(name) : name),
    );
    const client = await module.getClient();

    // Each name renews on the one renewer that takes it: the ETHRegistrar
    // for ENSv2 names, ETHRenewerV1 for names still on ENS v1.
    const byRenewer = new Map<Address, { labels: string[]; total: bigint }>();
    for (const label of labels) {
      let renewer: Address | undefined;
      for (const candidate of renewers) {
        const renewable = await client.readContract({
          address: candidate,
          abi: renewerAbi,
          functionName: "isRenewable",
          args: [label],
        });
        if (renewable) {
          renewer = candidate;
          break;
        }
      }
      if (!renewer) {
        throw new ErrorException(
          `${label}.eth cannot be renewed: it is not registered, or it is past its grace period`,
        );
      }
      const price = await client
        .readContract({
          address: renewer,
          abi: renewerAbi,
          functionName: "getRenewPrice",
          args: [label, BigInt(duration), paymentToken],
        })
        .catch(() => {
          throw new ErrorException(
            `no renewal price for ${label}.eth in ${paymentToken}: the token is not one the renewer accepts (USDC or DAI), or the duration is too short`,
          );
        });
      const entry = byRenewer.get(renewer) ?? { labels: [], total: 0n };
      entry.labels.push(label);
      entry.total += price;
      byRenewer.set(renewer, entry);
    }

    const payer = (await module.getSender()) as Address;
    const actions: Action[] = [];
    for (const [renewer, { labels: batch, total }] of byRenewer) {
      actions.push(
        ...(await buildApprovalActions(
          module,
          paymentToken,
          payer,
          renewer,
          total,
        )),
      );
      actions.push({
        to: renewer,
        data: encodeFunctionData({
          abi: renewerAbi,
          functionName: "renewBatch",
          args: [
            batch.map((label) => ({
              label,
              duration: BigInt(duration),
              referrer: NO_REFERRER,
            })),
            paymentToken,
          ],
        }),
      });
    }
    return actions;
  },
});

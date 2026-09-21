import "../setup";
import { afterEach, describe, expect, it } from "bun:test";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import { TWAP_CREATION_CHAINS, TWAP_NETWORKS } from "../../src/twap/networks";
import { checkTwapService } from "../../src/twap/serviceCheck";
import { SOME_ADDRESS } from "../fixtures";
import { server } from "../setup";

afterEach(() => server.resetHandlers());
describe("TWAP > explicit read-only release service check", () => {
  const txHash = `0x${"ab".repeat(32)}` as const;
  const uid = `0x${"cd".repeat(56)}` as const;
  function fixtures(chainId: number, age = 0, scheme = "eip1271") {
    server.use(
      http.post(
        "https://programmatic-orders.cow.fi/graphql",
        async ({ request }) => {
          const body = (await request.json()) as { query: string };
          return HttpResponse.json({
            data: body.query.includes("query Parts")
              ? {
                  partOrders: {
                    items: [{ orderUid: uid, status: "fulfilled" }],
                    totalCount: 1,
                  },
                }
              : {
                  programmaticOrders: {
                    items: [
                      {
                        chainId,
                        eventId: "fixture",
                        owner: SOME_ADDRESS,
                        txHash,
                        creationDate: String(
                          Math.floor(Date.now() / 1000) - age,
                        ),
                      },
                    ],
                    totalCount: 1,
                  },
                },
          });
        },
      ),
      http.post(
        `https://api.cow.fi/${TWAP_NETWORKS[chainId].slug}/api/v1/orders/by_uids`,
        () =>
          HttpResponse.json([
            {
              order: {
                uid,
                owner: SOME_ADDRESS,
                status: "fulfilled",
                signingScheme: scheme,
              },
            },
          ]),
      ),
    );
  }
  it.each([...TWAP_CREATION_CHAINS])(
    "checks recent parent and child service observations on chain %s",
    async (chain) => {
      fixtures(chain);
      const evidence = await checkTwapService(chain);
      expect(evidence.chainId).toBe(chain);
      expect(evidence.partUid).toBe(uid);
      expect(evidence.registrationTx).toBe(txHash);
      expect(evidence.upstream.frontend).toHaveLength(40);
    },
  );
  it("rejects stale records, wrong signing schemes and an unavailable indexer", async () => {
    fixtures(100, 8 * 86400);
    await expect(checkTwapService(100)).rejects.toThrow("seven days");
    fixtures(100, 0, "eip712");
    await expect(checkTwapService(100)).rejects.toThrow(
      "support not confirmed",
    );
    server.use(
      http.post(
        "https://programmatic-orders.cow.fi/graphql",
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    await expect(checkTwapService(100)).rejects.toThrow("503");
  });
});

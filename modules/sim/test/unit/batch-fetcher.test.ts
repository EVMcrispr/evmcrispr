import { describe, expect, it } from "bun:test";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import { createBatchFetcher } from "../../src/lib/backend";
import { server } from "../setup";

const NODE = "http://batch-fetcher.test/node";

/** A node answering each eth_getStorageAt with its slot, that refuses a
 *  batch longer than `limit` and fails the items `failing` names once. */
function node(limit: number, failing: Set<string> = new Set()) {
  const posts: number[] = [];
  server.use(
    http.post(NODE, async ({ request }) => {
      const body = (await request.json()) as any;
      const items = Array.isArray(body) ? body : [body];
      posts.push(items.length);
      if (Array.isArray(body) && items.length > limit)
        return HttpResponse.json(
          { error: { code: -32014, message: "batch too large" } },
          { status: 413 },
        );
      const answers = items.map(({ id, params }: any) => {
        const slot = params[1] as string;
        if (failing.delete(slot))
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32000, message: "busy" },
          };
        return { jsonrpc: "2.0", id, result: slot };
      });
      return HttpResponse.json(Array.isArray(body) ? answers : answers[0]);
    }),
  );
  return posts;
}

const reads = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    method: "eth_getStorageAt",
    params: [
      "0x0000000000000000000000000000000000000001",
      `0x${i.toString(16)}`,
      "latest",
    ],
  }));

describe("Batch fetcher", () => {
  it("asks many reads in a few requests, answered in order", async () => {
    const posts = node(1000);
    const fetchMany = createBatchFetcher(NODE, undefined, { size: 100 });
    const answers = await fetchMany(reads(250));
    expect(answers).toEqual(reads(250).map((r) => r.params[1]));
    expect(posts).toEqual([100, 100, 50]);
  });

  it("splits a batch the node refuses, and keeps the size that passed", async () => {
    const posts = node(10);
    const fetchMany = createBatchFetcher(NODE, undefined, {
      size: 100,
      concurrency: 1,
    });
    expect(await fetchMany(reads(40))).toEqual(
      reads(40).map((r) => r.params[1]),
    );
    const refused = posts.filter((n) => n > 10).length;
    posts.length = 0;
    expect(await fetchMany(reads(40))).toEqual(
      reads(40).map((r) => r.params[1]),
    );
    expect(refused).toBeGreaterThan(0);
    // The second time, no batch is refused.
    expect(posts.every((n) => n <= 10)).toBe(true);
  });

  it("asks an item again alone when the batch answered it with an error", async () => {
    node(1000, new Set(["0x3"]));
    const fetchMany = createBatchFetcher(NODE);
    expect(await fetchMany(reads(5))).toEqual(reads(5).map((r) => r.params[1]));
  });
});

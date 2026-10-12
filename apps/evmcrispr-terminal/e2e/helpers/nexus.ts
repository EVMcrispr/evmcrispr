import type { BrowserContext, Page } from "@playwright/test";
import { type Answer, sse } from "../../test/helpers/nexus";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};

/** Stands in for Dappnode Nexus in every page of `context`: completions
 *  take the next scripted answer; nothing reaches the real service. */
export async function mockNexus(context: BrowserContext) {
  const nexus = {
    answers: [] as Answer[],
    /** The bodies of the completion requests made. */
    requests: [] as string[],
    /** While set, answers wait for it: a turn in flight. */
    gate: null as Promise<void> | null,
  };
  let n = 0;
  await context.route(/nexus-(api|cp|auth)\.dappnode\.com/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: CORS });
    if (!request.url().endsWith("/chat/completions"))
      return route.fulfill({ status: 404, headers: CORS, body: "{}" });
    nexus.requests.push(request.postData() ?? "");
    await nexus.gate;
    return route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": "text/event-stream" },
      body: sse(nexus.answers.shift() ?? { text: "Done." }, n++),
    });
  });
  // A key is all the app needs to offer the chat.
  await context.addInitScript(() => {
    localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
  });
  return nexus;
}

/** The chats this browser keeps, from its storage. */
export function storedChats(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ id: string; items: number; label?: string }[]>(
        (resolve) => {
          const open = indexedDB.open("evmcrispr");
          open.onsuccess = () => {
            const all = open.result
              .transaction("chats")
              .objectStore("chats")
              .getAll();
            all.onsuccess = () =>
              resolve(
                all.result.map((record) => ({
                  id: record.id,
                  items: record.chat.items.length,
                  label: record.meta.scopeId,
                })),
              );
          };
        },
      ),
  );
}

import { revisions, withTitle } from "@evmcrispr/space";
import type { SpaceExport } from "../space/export";
import { type EncryptedReason, fetchShared, isCID } from "../space/links";
import type { App } from "./boot";
import { SCRIPT_PLACEHOLDER } from "./ui-store";

export interface RouteInput {
  /** The id in the address: a space id, a CID, or nothing. */
  id: string | undefined;
  /** The decryption key of a share link (the fragment after the route). */
  key: string | undefined;
  /** The inline form, `?title=&script=` (links made for the Safe app). */
  inline: { title: string | null; script: string | null };
}

export type Resolution =
  | { kind: "open"; id: string }
  /** A space was made for this address; go to it. */
  | { kind: "created"; id: string; received: boolean; encrypted: boolean }
  | { kind: "not-found" }
  | { kind: "ipfs-error" }
  | { kind: "encrypted"; reason: EncryptedReason; requiredVersion?: string }
  /** The address is an exported space. Nothing was made or merged: the
   *  user is asked what to do with it. */
  | { kind: "export"; exported: SpaceExport }
  | { kind: "refused"; why: string };

type Deps = Pick<App, "spaces" | "storage">;

/** The placeholder space of this browser: reused while nobody touched it,
 *  so untouched ones do not pile up in the list. */
async function placeholderSpace({ spaces, storage }: Deps): Promise<string> {
  const known = await storage.records.getPref<string>("placeholderSpaceId");
  const space = known ? await spaces.acquire(known) : null;
  if (known && space) {
    const untouched =
      space.getText() === SCRIPT_PLACEHOLDER &&
      revisions(space.timeline.getState()).length === 1;
    spaces.release(known);
    if (untouched) return known;
  }
  const id = await spaces.create({ text: SCRIPT_PLACEHOLDER, source: "user" });
  await storage.records.setPref("placeholderSpaceId", id);
  return id;
}

/** What the address means. Creates the space when the address asks for
 *  one (a share link, an inline link, no id); never opens it. An exported
 *  space is only handed back: see `Resolution`. A space
 *  starts approved however it arrived: opening a script is accepting it
 *  as the starting point. Storage failing is an address that cannot be
 *  opened, not an exception: the screen always has something to show. */
export async function resolveRoute(
  app: Deps,
  input: RouteInput,
  fetchText: (cid: string) => Promise<string | undefined>,
): Promise<Resolution> {
  try {
    return await resolve(app, input, fetchText);
  } catch {
    return { kind: isCID(input.id) ? "ipfs-error" : "not-found" };
  }
}

async function resolve(
  app: Deps,
  input: RouteInput,
  fetchText: (cid: string) => Promise<string | undefined>,
): Promise<Resolution> {
  const { spaces, storage } = app;
  if (!input.id) {
    const { title, script } = input.inline;
    if (!title && !script) return created(await placeholderSpace(app));
    // Deliberately approved from the start, like every space (spec,
    // "Review before signing": every space starts approved). It is framed
    // as received, which informs and gates nothing.
    return created(
      await spaces.create({
        text: withTitle(title ?? "", script ?? ""),
        source: "import",
      }),
      { encrypted: false },
    );
  }
  if (isCID(input.id)) {
    const shared = await fetchShared(input.id, input.key, fetchText);
    if (shared.status === "error") return { kind: "ipfs-error" };
    if (shared.status === "encrypted") {
      const { status: _, ...refusal } = shared;
      return { kind: "encrypted", ...refusal };
    }
    if (shared.status === "refused")
      return { kind: "refused", why: shared.why };
    // An export names the space it goes into, which may be one of the
    // user's: opening the link never restores or merges by itself.
    if (shared.status === "space")
      return { kind: "export", exported: shared.exported };
    return created(
      await spaces.create({
        text: withTitle(shared.title, shared.script),
        source: "import",
        origin: { cid: input.id },
      }),
      shared,
    );
  }
  return (await storage.records.getSpace(input.id))
    ? { kind: "open", id: input.id }
    : { kind: "not-found" };
}

const created = (id: string, shared?: { encrypted: boolean }): Resolution => ({
  kind: "created",
  id,
  received: !!shared,
  encrypted: !!shared?.encrypted,
});

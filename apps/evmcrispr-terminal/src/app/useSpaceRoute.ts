import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useStore } from "zustand";
import fetchPin from "../api/pinata/fetch-pin";
import type { SpaceExport } from "../space/export";
import { type EncryptedReason, isCID } from "../space/links";
import type { LiveSpace } from "../space/live-space";
import { useApp } from "./AppContext";
import { type Resolution, resolveRoute } from "./space-route";

export type SpaceRoute =
  | { status: "loading"; ipfs: boolean }
  | {
      status: "ready";
      space: LiveSpace;
      /** "recipient" on the landing that follows opening a share link. */
      intent: "author" | "recipient";
      sharedEncrypted: boolean;
    }
  | { status: "not-found" }
  | { status: "ipfs-error" }
  | { status: "encrypted"; reason: EncryptedReason; requiredVersion?: string }
  /** An exported space was opened: the user decides what becomes of it. */
  | { status: "export"; exported: SpaceExport }
  | { status: "refused"; why: string }
  /** The space was deleted, here or in another tab, while on screen. */
  | { status: "removed" };

const fetchText = (cid: string) => fetchPin(cid);

/** `?title=&script=` and `?stdin=` live inside the hash route's query. */
function hashQuery(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split("?")[1]?.split("#")[0]);
}

/** Turns the address into the space on screen: creates one when the
 *  address asks for it, loads it, and holds it while it is shown. */
export function useSpaceRoute(): SpaceRoute {
  const app = useApp();
  const { scriptId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  // Share links carry the key as the last fragment segment
  // (#/<cid>?mode=view#<key>); react-router surfaces it as location.hash.
  const key = location.hash ? location.hash.slice(1) : undefined;
  const [route, setRoute] = useState<SpaceRoute>({
    status: "loading",
    ipfs: isCID(scriptId),
  });
  // The space just made from a share link: its first landing keeps the
  // recipient framing, a later visit is an authoring one.
  const received = useRef<{ id: string; encrypted: boolean } | null>(null);
  // One resolution per address, also when React runs the effect twice
  // (StrictMode): a share link must not be imported two times.
  const inflight = useRef<{
    address: string;
    result: Promise<Resolution>;
  } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the address is scriptId + key; navigate and the query are read when it changes
  useEffect(() => {
    let live = true;
    let held: string | null = null;
    // Going from one local space to another is instant: keep the current
    // one on screen meanwhile instead of flashing a loader.
    setRoute((current) =>
      current.status === "ready" && !isCID(scriptId)
        ? current
        : { status: "loading", ipfs: isCID(scriptId) },
    );
    const address = `${scriptId ?? ""}#${key ?? ""}`;
    if (inflight.current?.address !== address) {
      const query = hashQuery();
      inflight.current = {
        address,
        result: resolveRoute(
          app,
          {
            id: scriptId,
            key,
            inline: { title: query.get("title"), script: query.get("script") },
          },
          fetchText,
        ),
      };
    }
    void inflight.current.result.then(async (resolution) => {
      if (!live) return;
      if (resolution.kind === "created") {
        received.current = resolution.received
          ? { id: resolution.id, encrypted: resolution.encrypted }
          : null;
        const stdin = hashQuery().get("stdin");
        const suffix =
          stdin === null ? "" : `?${new URLSearchParams({ stdin })}`;
        navigate(`/${resolution.id}${suffix}`, { replace: true });
        return;
      }
      if (resolution.kind !== "open") {
        const { kind: status, ...rest } = resolution;
        setRoute({ status, ...rest } as SpaceRoute);
        return;
      }
      // A space that cannot be loaded is one that cannot be opened.
      const space = await app.spaces.acquire(resolution.id).catch(() => null);
      if (!live) {
        if (space) app.spaces.release(resolution.id);
        return;
      }
      if (!space) {
        setRoute({ status: "not-found" });
        return;
      }
      held = resolution.id;
      app.spaces.show(resolution.id);
      // Runs left unfinished by a tab that is gone are interrupted.
      void app.runs.adopt(space).catch(() => {});
      const from =
        received.current?.id === resolution.id ? received.current : null;
      received.current = null;
      setRoute({
        status: "ready",
        space,
        intent: from ? "recipient" : "author",
        sharedEncrypted: !!from?.encrypted,
      });
    });
    return () => {
      live = false;
      if (!held) return;
      // The address no longer names this space: it is off screen from
      // now, whatever is still drawn while the next one loads. A run's
      // wallet requests are held on exactly this.
      if (app.spaces.onScreen.getState() === held) app.spaces.show(null);
      app.spaces.release(held);
    };
  }, [app, scriptId, key]);

  const listed = useStore(
    app.spaces.index,
    (list) =>
      route.status !== "ready" ||
      list.some((meta) => meta.id === route.space.id),
  );
  // While the address already names another space, this one is on its
  // way out: its removal is not news.
  const leaving = route.status === "ready" && route.space.id !== scriptId;
  return listed || leaving ? route : { status: "removed" };
}

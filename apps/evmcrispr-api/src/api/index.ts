import { type ApiContext, createContext, json, preflight } from "./common.js";
import { abi, contract } from "./contracts.js";
import { eez } from "./eez.js";
import { etherscan } from "./etherscan.js";
import { pin } from "./ipfs.js";
import { corsProxy } from "./proxy.js";
import { tavily } from "./tavily.js";
import { tokenlist } from "./tokenlist.js";

export function createApi(options: Partial<ApiContext> = {}) {
  const context = createContext(options);
  return {
    context,
    async fetch(req: Request, peer = "unknown"): Promise<Response> {
      const path = new URL(req.url).pathname;
      const lookup = /^\/(abi|contract|source)\/([^/]+)\/([^/]+)$/.exec(path);
      const tokens = /^\/tokenlist\/([^/]+)$/.exec(path);
      const rpc = /^\/experimental-eez-rpc\/([^/]+)\/?$/.exec(path);
      const known =
        lookup ||
        tokens ||
        rpc ||
        path.startsWith("/cors-proxy/") ||
        ["/etherscan", "/ipfs/pin", "/search", "/extract", "/health"].includes(
          path,
        );
      if (!known) return json(404, { error: "not found" });
      if (req.method === "OPTIONS")
        return preflight(
          path.startsWith("/cors-proxy/")
            ? "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS"
            : path === "/ipfs/pin"
              ? "POST, OPTIONS"
              : "GET, POST, OPTIONS",
        );
      try {
        if (path === "/health" && req.method === "GET")
          return json(context.store.healthy() ? 200 : 503, {
            status: context.store.healthy() ? "ok" : "unavailable",
          });
        if (lookup && req.method === "GET")
          return await (lookup[1] === "abi"
            ? abi(context, lookup[2], lookup[3])
            : contract(context, req, peer, lookup[1], lookup[2], lookup[3]));
        if (tokens && req.method === "GET")
          return await tokenlist(context, tokens[1]);
        if (path === "/etherscan" && ["GET", "POST"].includes(req.method))
          return await etherscan(context, req, peer);
        if (path === "/ipfs/pin" && req.method === "POST")
          return await pin(context, req, peer);
        if (["/search", "/extract"].includes(path) && req.method === "GET")
          return await tavily(context, req, peer);
        if (path.startsWith("/cors-proxy/"))
          return await corsProxy(context, req);
        if (rpc) return await eez(context, req, rpc[1]);
        return json(405, { error: "method not allowed" });
      } catch {
        return json(502, { error: "upstream request failed" });
      }
    },
    close() {
      context.store.close();
    },
  };
}

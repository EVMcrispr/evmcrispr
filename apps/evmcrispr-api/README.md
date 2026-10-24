# EVMcrispr API and MCP

One Bun HTTP server hosts the REST API previously in `evmcrispr-api-rs`
and the existing MCP server. REST handlers live in `src/api`, MCP tools,
resources and transports in `src/mcp`, and the shared HTTP listener in
`src/http.ts`. Both interfaces deploy together from this app.

Routing checks the actual HTTP hostname before
preflight, provider calls or MCP initialization:

| Host | Available routes |
| --- | --- |
| `api.evmcrispr.com` | API routes below; `/mcp` and `/mcp/*` return 404 |
| `mcp.evmcrispr.com` | `/mcp` only |
| Any other hostname | 404 |

`Origin`, `Forwarded` and `X-Forwarded-Host` do not select an interface.
The domains share one process, port and Render web service. Host routing
separates interfaces; both remain public services.

## API routes

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/health` | Process readiness; 200 or 503 |
| GET | `/abi/:chainId/:address` | Etherscan ABI with Blockscout fallback |
| GET | `/contract/:chainId/:address` | Verified metadata, ABI and file names |
| GET | `/source/:chainId/:address` | Verified metadata and source files; `?file=path` selects a file |
| GET | `/tokenlist/:chainId` | CoinGecko token list |
| GET, POST | `/etherscan` | Restricted Etherscan V2 forwarding |
| POST | `/ipfs/pin` | Pinata JSON or multipart upload, preserving request bytes |
| GET | `/search?q=...&count=5` | Tavily search |
| GET | `/extract?url=https://...` | Tavily Markdown extraction |
| Any | `/cors-proxy/https://...` | Streaming proxy restricted to configured HTTPS origins and paths |
| POST | `/experimental-eez-rpc/:key` | EEZ execution/front RPC routing, including Safe calls |

Known API routes support OPTIONS. Contract/source accept `?sourcify` to try
Sourcify first; `0`, `false`, `no` and `off` disable it. Verified source is
cached for a year and unverified status for an hour when
`CONTRACT_KV_CACHE=on`. ABI and token list caching are always enabled.
Expired successful entries can be used during provider outages. Proxy
implementation addresses are never retained in contract metadata.

The port preserves the Rust response shapes, source lookup order, body
limits, provider fallbacks, and EEZ transaction bytes. Its proxy allowlist
uses parsed origins and path boundaries and does not follow redirects.
Search/extract also have quotas, bounding use of the server's Tavily key.

## Run locally

From the repository root, with Bun 1.4.4 or newer:

```sh
bun install --frozen-lockfile
bunx turbo run build --filter=evmcrispr-api
bun run --cwd apps/evmcrispr-api start
curl -H 'Host: api.evmcrispr.com' http://localhost:3002/health
```

For local browser clients, set `API_HOSTNAME=api.localhost` and
`MCP_HOSTNAME=mcp.localhost`, then use those hostnames on port 3002.
`TRANSPORT=stdio` continues to run the MCP server alone.

## Existing Render service

Update **`srv-d6ritceuk2gs73fomtd0`** in the
[Render dashboard](https://dashboard.render.com/web/srv-d6ritceuk2gs73fomtd0).
Use the existing service rather than creating another service or Blueprint.

| Setting | Value |
| --- | --- |
| Runtime | Node / Bun |
| Branch | `next` |
| Root directory | Repository root (empty) |
| Build command | `bash apps/evmcrispr-api/render/build.sh` |
| Start command | `bash apps/evmcrispr-api/render/start.sh` |
| Instances | 1 |
| Persistent disk | None |
| Health check path | Empty, using Render's default TCP check |
| Custom domains | `api.evmcrispr.com` and `mcp.evmcrispr.com` |

Copy the non-secret settings in [render/env.example](render/env.example)
into the service's environment. Render supplies `PORT`; the server binds
`0.0.0.0:$PORT`. `.bun-version` and `BUN_VERSION` pin the patched Bun runtime,
and startup also enforces the root package's minimum version. The source
entry point uses the generated workspace modules prepared during the build.

Set `ETHERSCAN_API_KEY`, `PINATA_JWT` and `TAVILY_API_KEY` in Render. The old
`VITE_` names remain supported. Startup shares the first two canonical names
with the CLI-backed MCP tools. Keep these keys out of frontend environments.
Routes that need an absent key return a configuration error; keyless source
providers remain available for contract lookups.

Caches and rate counters live in memory and reset on deploy or restart.
Cache entries are bounded to 1,024 entries and 64 MiB. Quota counting is
synchronous within the single process. No database, disk mount or disk
environment variables are needed. If the service is scaled to multiple
instances, each instance has its own quotas; use a shared store if global
limits across instances become necessary.

Render chooses one verified custom domain for HTTP health checks, which can
be the MCP domain. Leave the HTTP health-check path empty so hostname
isolation stays strict. `/health` remains available on the API domain for
external application checks. See [Render health checks](https://render.com/docs/health-checks).

`CLIENT_ADDRESS_HEADER=x-forwarded-for` trusts only the final forwarded
address appended by the ingress, rather than a caller-supplied first entry.
Use it only behind Render's ingress. Without it, the socket peer is used.
IPv4-mapped IPv6 addresses are normalized and IPv6 callers share a /64 quota.
The total quotas still apply when individual callers cannot be identified.

Rate limits use independent 600-second windows by default:

| Prefix | Per caller (`*_LIMIT`) | Total (`*_TOTAL_LIMIT`) |
| --- | --- | --- |
| `PIN` | 30 | 600 |
| `ETHERSCAN` | 200 | 1,500 |
| `CONTRACT` | 60 | 600 |
| `TAVILY` | 60 | 600 |

Each also accepts `*_WINDOW_SECS`. Cached contract lookups do not consume
quota. `ALLOWED_ORIGINS`, `ALLOWED_TARGET_DOMAINS` and `EEZ_CHAINS` retain the
Rust API's configuration formats. Origin checks protect browser use of
pinning and Etherscan; they are not authentication for non-browser clients.

Add both custom domains to this same Render service, then point their DNS
records at the target Render reports. Verify certificates and the checks
below before moving production API traffic away from Fermyon. Removing the
old Fermyon deployment is a separate step after the cutover is verified.

```sh
curl -i https://api.evmcrispr.com/health        # 200
curl -i https://api.evmcrispr.com/mcp           # 404
curl -i https://mcp.evmcrispr.com/health        # 404
curl -i -X OPTIONS https://mcp.evmcrispr.com/mcp # 204
```

Then connect an MCP client at `https://mcp.evmcrispr.com/mcp`, list its eight
tools and validate `set $x 42`. Exercise source, token list and EEZ read calls;
use an intentional test pin to verify the configured Pinata account.

The migrated API's outbound HTTPS uses Bun's certificate validation; it no
longer runs through Spin's TLS host. Rebuilding and running the service on
the pinned runtime is necessary for the certificate fix to reach production.
In the deployed service's Render shell, run:

```sh
bun run --cwd apps/evmcrispr-api check:tls
```

This uses the API's outbound client against the incident checker's control
and all 14 test chains. Exit 0 means all chains were explicitly rejected
with a working control, 1 means at least one was accepted, and 2 means the
result was inconclusive. It adds no public diagnostic endpoint.

## Verification

```sh
bun run --cwd apps/evmcrispr-api test:unit
bun run --cwd apps/evmcrispr-api type-check
bunx biome check apps/evmcrispr-api/src apps/evmcrispr-api/test
```

Tests cover hostname isolation and preflight, an actual MCP HTTP handshake,
Rust Sourcify fixtures, provider normalization and stale caches, bounded
quotas and failure handling, upload byte preservation, forwarding filters,
and signed EEZ transaction routing. Providers are mocked; no paid calls or
live transactions are made by these tests.

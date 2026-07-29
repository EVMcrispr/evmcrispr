import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import {
  createTestServer,
  HttpResponse,
  http,
  passthrough,
} from "@evmcrispr/test-utils/msw/server";

registerAllModules();
// Re-register with a local loader: the registry's own dynamic import
// resolves from test-utils, whose isolated node_modules doesn't link this
// package.
evml.use({ name: "contracts", load: () => import("../src/index") });

const FIXTURES_DIR = join(import.meta.dirname, "fixtures/contracts");

function fixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

// Solidity sources served by the mocked hosting + unpkg endpoints used by
// the @solidity URL/import tests.
const contractsHandlers = [
  http.get("https://sources.example.com/:file", ({ params }) => {
    const file = params.file as string;
    if (["Counter.sol", "Parent.sol", "Child.sol"].includes(file)) {
      return new HttpResponse(fixture(file), {
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new HttpResponse(null, { status: 404 });
  }),
  // npm-style imports resolve through unpkg; serve a fake package with an
  // internal relative import to exercise per-package resolution.
  http.get("https://unpkg.com/@fake/lib/contracts/:file", ({ params }) => {
    const file = params.file as string;
    if (file === "FakeLib.sol") {
      return new HttpResponse(fixture("FakeLib.sol"), {
        headers: { "Content-Type": "text/plain" },
      });
    }
    if (file === "FakeUtil.sol") {
      return new HttpResponse(fixture("FakeUtil.sol"), {
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new HttpResponse(null, { status: 404 });
  }),
  // The solc release list and soljson binaries are fetched live (bypass
  // would cover this, but make the intent explicit).
  http.get("https://binaries.soliditylang.org/*", () => passthrough()),
];

// Shared MSW handlers (etherscan verify/creation mocks used by the
// deploy/verify mirror tests) plus the contracts-specific ones above.
export const server = createTestServer(...contractsHandlers);
server.listen({ onUnhandledRequest: "bypass" });

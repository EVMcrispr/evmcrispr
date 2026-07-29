import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { registerAllModules } from "../../src/lib/modules.js";
import { publishModule } from "../../src/tools/publish-module.js";

registerAllModules();

const CID = "QmModulePinFixture1111111111111111111111111111";
const MODULE_SOURCE = `def module math (
  def @double "$n: number -> number" @num($n * 2)
  def pause "$n: number" (
    wait $n
  )
)`;

const originalFetch = globalThis.fetch;
const originalJwt = process.env.VITE_PINATA_JWT;

let pinnedUrl: string | undefined;
let pinnedBody: FormData | undefined;

beforeEach(() => {
  process.env.VITE_PINATA_JWT = "test-jwt";
  pinnedUrl = undefined;
  pinnedBody = undefined;
  globalThis.fetch = mock(async (url: any, init: any) => {
    pinnedUrl = String(url);
    pinnedBody = init.body;
    return {
      ok: true,
      json: async () => ({ IpfsHash: CID }),
    };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.VITE_PINATA_JWT = originalJwt;
});

describe("publishModule", () => {
  it("pins the plain module text and returns the load line", async () => {
    const result = await publishModule({ source: MODULE_SOURCE });

    expect(result.success).toBe(true);
    expect(result.cid).toBe(CID);
    expect(result.uri).toBe(`ipfs://${CID}`);
    expect(result.moduleName).toBe("math");
    expect(result.loadLine).toBe(`load math --from ipfs://${CID}`);
    // Byte-exact plain text via pinFileToIPFS, not JSON-encoded.
    expect(pinnedUrl).toContain("pinFileToIPFS");
    const file = pinnedBody?.get("file") as Blob;
    expect(await file.text()).toBe(MODULE_SOURCE);
    const metadata = JSON.parse(pinnedBody?.get("pinataMetadata") as string);
    expect(metadata.keyvalues.type).toBe("evmcrispr/module");
  });

  it("rejects files without exactly one module command", async () => {
    const multi = `${MODULE_SOURCE}\nprint "extra"`;
    const result = await publishModule({ source: multi });
    expect(result.success).toBe(false);
    expect(result.error).toContain("exactly one def module command");

    const none = await publishModule({ source: 'print "hi"' });
    expect(none.success).toBe(false);
  });

  it("rejects module files with validation errors", async () => {
    const bad = `def module math (
  set $x 1
)`;
    const result = await publishModule({ source: bad });
    expect(result.success).toBe(false);
    expect(result.error).toContain("validation errors");
    expect(result.diagnostics).toBeDefined();
  });

  it("fails without a Pinata JWT", async () => {
    delete process.env.VITE_PINATA_JWT;
    const result = await publishModule({ source: MODULE_SOURCE });
    expect(result.success).toBe(false);
    expect(result.error).toContain("VITE_PINATA_JWT");
  });
});

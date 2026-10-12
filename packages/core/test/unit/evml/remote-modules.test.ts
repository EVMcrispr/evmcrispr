import { afterEach, beforeEach, describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { createEvml } from "../../../src/evml/tag";

// A syntactically valid CID nobody serves: every request for it is
// answered here, and counted.
const CID = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
const SCRIPT = `load lib --from "ipfs://${CID}"\nlib:pay 1`;

describe("evml > validate > external modules", () => {
  const real = globalThis.fetch;
  let requests: string[] = [];
  beforeEach(() => {
    requests = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requests.push(String(input instanceof Request ? input.url : input));
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = real;
  });

  it("fetches a module the script names, by default", async () => {
    const result = await createEvml().script(SCRIPT).validate();
    expect(requests.some((url) => url.includes(CID))).to.equal(true);
    expect(result.unfetched).to.deep.equal([]);
  });

  it("with remote modules off, asks nobody for it and reports it as unchecked", async () => {
    const result = await createEvml()
      .script(SCRIPT)
      .validate({ remoteModules: false });
    expect(requests).to.deep.equal([]);
    expect(result.unfetched).to.deep.equal(["lib"]);
    // Its commands are not checked, so they are not reported either.
    expect(result.valid).to.equal(true);
  });

  it("a workspace told not to fetch names what it left out, and fetches again once told to", async () => {
    const workspace = createEvml().workspace();
    workspace.setRemoteModules(false);
    await workspace.getFullDiagnostics(SCRIPT);
    await workspace.getKeywords(SCRIPT);
    await workspace.prewarm(SCRIPT);
    expect(requests).to.deep.equal([]);
    expect(workspace.unfetchedModules).to.deep.equal(["lib"]);

    workspace.setRemoteModules(true);
    await workspace.getFullDiagnostics(SCRIPT);
    expect(requests.some((url) => url.includes(CID))).to.equal(true);
    expect(workspace.unfetchedModules).to.deep.equal([]);
  });

  it("a script that names no external module leaves nothing unchecked", async () => {
    const result = await createEvml()
      .script("set $x 1")
      .validate({ remoteModules: false });
    expect(result.unfetched).to.deep.equal([]);
    expect(requests).to.deep.equal([]);
  });

  it("asks the host's function at each analysis, of the text analysed, on every path that can fetch", async () => {
    const workspace = createEvml().workspace();
    const asked: string[] = [];
    let approved = "";
    workspace.setRemoteModules((script) => {
      asked.push(script);
      return script === approved;
    });
    const position = { line: 2, col: 4 };
    await workspace.getFullDiagnostics(SCRIPT);
    await workspace.getKeywords(SCRIPT);
    await workspace.getCompletions(SCRIPT, position);
    await workspace.getHoverInfo(SCRIPT, position);
    await workspace.getSignatureHelp(SCRIPT, position);
    await workspace.prewarm(SCRIPT);
    expect(requests).to.deep.equal([]);
    // Once by each path for the modules, and once more by the two that
    // could resolve a helper or read a chain (completions, hover).
    expect(asked).to.have.length(8);
    expect(new Set(asked)).to.deep.equal(new Set([SCRIPT]));

    // The answer is of the text, not of the moment the function was
    // given: the same workspace fetches for the approved text only.
    approved = SCRIPT;
    const other = `${SCRIPT}\nprint 1`;
    await workspace.getFullDiagnostics(other);
    expect(requests).to.deep.equal([]);
    expect(workspace.unfetchedModules).to.deep.equal(["lib"]);
    await workspace.getFullDiagnostics(SCRIPT);
    expect(requests.some((url) => url.includes(CID))).to.equal(true);
  });

  it("resolves no helper of a text the host does not let fetch", async () => {
    const helper = `set $x @ipfs.get("${CID}")`;
    const workspace = createEvml().workspace();
    workspace.setRemoteModules(false);
    await workspace.prewarm(helper);
    const end = { line: 2, col: 5 };
    await workspace.getCompletions(`${helper}\nexec `, end);
    await workspace.getHoverInfo(helper, { line: 1, col: 6 });
    expect(requests).to.deep.equal([]);

    // Nor after a `switch`, nor for the functions of a contract it names.
    const call = "switch 100\nexec 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d ";
    await workspace.getCompletions(call, { line: 2, col: call.length - 11 });
    await workspace.getHoverInfo(call, { line: 2, col: 10 });
    expect(requests).to.deep.equal([]);

    workspace.setRemoteModules(true);
    await workspace.prewarm(helper);
    expect(requests.some((url) => url.includes(CID))).to.equal(true);
  });

  it("fetches nothing when the host's function throws, or answers anything but true", async () => {
    const workspace = createEvml().workspace();
    workspace.setRemoteModules(() => {
      throw new Error("the space is gone");
    });
    await workspace.getFullDiagnostics(SCRIPT);
    await workspace.prewarm(SCRIPT);
    workspace.setRemoteModules((() => undefined) as unknown as () => boolean);
    await workspace.getFullDiagnostics(SCRIPT);
    expect(requests).to.deep.equal([]);
    expect(workspace.unfetchedModules).to.deep.equal(["lib"]);
  });
});

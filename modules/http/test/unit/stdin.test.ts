import { describe, expect, it, spyOn } from "bun:test";
import { createEvml, Interpreter, parseScript } from "@evmcrispr/core";
import { custom } from "viem";
import Http from "../../src";

const tag = createEvml({
  transports: {
    1: custom({
      request: async () => {
        throw new Error("RPC forbidden");
      },
    }),
  },
}).use(Http);
const source = "load http [@fetch]\nprint @fetch(stdin:)";

describe("explicit stdin input", () => {
  it("returns exact supplied text repeatedly, including empty input, without host actions or network", async () => {
    const network = spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network forbidden"),
    );
    try {
      for (const stdin of ["", "café 🚀\n", '{"nonce":"9007199254740993"}']) {
        const output: string[] = [];
        await tag
          .with({ stdin, onOutput: (text) => output.push(text) })
          .script(`${source}\nprint @fetch(stdin:)`)
          .execute(undefined, {
            handlers: {
              terminal: async () => {
                throw new Error("Host actions forbidden");
              },
            },
          });
        expect(output).toEqual([stdin, stdin]);
      }
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });

  it("rejects missing input and HTTP options", async () => {
    await expect(tag.script(source).execute(undefined)).rejects.toThrow(
      "No script input supplied",
    );
    for (const args of [
      '"stdin:" GET',
      '"stdin:" body:test',
      '"stdin:" auth:test',
    ]) {
      await expect(
        tag
          .with({ stdin: "text" })
          .script(`load http [@fetch]\nprint @fetch(${args})`)
          .execute(undefined),
      ).rejects.toThrow("does not accept");
    }
  });

  it("never passes filesystem paths or non-HTTP protocols to native fetch", async () => {
    const network = spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network forbidden"),
    );
    try {
      for (const path of [
        "./file",
        "../file",
        "/tmp/file",
        "file:/tmp/file",
        "file:///tmp/file",
        "FILE:///tmp/file",
        "data:text/plain,test",
        "C:\\file",
      ]) {
        await expect(
          tag
            .script(`load http [@fetch]\nprint @fetch(${JSON.stringify(path)})`)
            .execute(undefined),
        ).rejects.toThrow("expects an HTTP(S) URL");
      }
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });

  it("validates and inspects without input, and simulation reuses supplied memory", async () => {
    const workspace = tag.workspace();
    expect((await tag.script(source).validate()).diagnostics).toEqual([]);
    await workspace.prewarm(source);
    await workspace.getCompletions(source, { line: 2, col: 12 });
    await workspace.getHoverInfo(source, { line: 2, col: 8 });
    const output: string[] = [];
    const interpreter = new Interpreter(tag.registry, {
      ...tag.config,
      stdin: "supplied",
      onOutput: (s) => output.push(s),
    });
    await interpreter.interpret("load http [@fetch]");
    await interpreter.interpretNodes(
      parseScript("print @fetch(stdin:)").ast.body,
      true,
      { simulation: true },
    );
    expect(output).toEqual(["supplied"]);
  });

  it("preserves HTTP request options, responses and status errors", async () => {
    const network = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("response"),
    );
    const output: string[] = [];
    try {
      await tag
        .with({ onOutput: (s) => output.push(s) })
        .script(
          'load http [@fetch]\nprint @fetch(https://example.test POST payload "Bearer token")',
        )
        .execute(undefined);
      expect(network).toHaveBeenCalledWith("https://example.test", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer token",
        },
        body: "payload",
      });
      expect(output).toEqual(["response"]);
      network.mockResolvedValue(
        new Response("", { status: 404, statusText: "Not Found" }),
      );
      await expect(
        tag
          .script("load http [@fetch]\nprint @fetch(https://example.test)")
          .execute(undefined),
      ).rejects.toThrow("404 Not Found");
    } finally {
      network.mockRestore();
    }
  });
});

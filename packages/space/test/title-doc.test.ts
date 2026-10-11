import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { applyText, initSpaceDoc, scriptText, strReplace } from "../src/doc";
import { deriveTitle, displayTitle, titleLine, withTitle } from "../src/title";

describe("title", () => {
  test("derivation", () => {
    expect(deriveTitle("# Pay the team\nexec 1")).toBe("Pay the team");
    expect(deriveTitle("\n\n  ## Two hashes  \nexec")).toBe("Two hashes");
    expect(deriveTitle("exec 1\n# later comment")).toBe("");
    expect(deriveTitle("")).toBe("");
    expect(deriveTitle("#\nexec")).toBe("");
    expect(titleLine("\n\n# T")).toBe(2);
    expect(titleLine("exec")).toBeNull();
  });
  test("display", () => {
    expect(displayTitle("")).toBe("Untitled");
    expect(displayTitle("exec @token(WETH) deposit()")).toBe(
      "Untitled · exec @token(WETH) deposit()",
    );
    expect(displayTitle("# A")).toBe("A");
  });
  test("old title inserted once", () => {
    const once = withTitle("Pay the team", "exec 1");
    expect(once).toBe("# Pay the team\nexec 1");
    expect(withTitle("Pay the team", once)).toBe(once);
    expect(withTitle("", "exec 1")).toBe("exec 1");
  });
});

describe("doc", () => {
  test("applyText replaces only what differs and converges", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    initSpaceDoc(a, { text: "one\r\ntwo\nthree", createdAt: 1 });
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(scriptText(a).toString()).toBe("one\ntwo\nthree");
    applyText(scriptText(a), "one\nTWO\nthree", "x");
    scriptText(b).insert(0, "zero\n");
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    expect(scriptText(a).toString()).toBe("zero\none\nTWO\nthree");
    expect(scriptText(b).toString()).toBe(scriptText(a).toString());
    expect(applyText(scriptText(a), scriptText(a).toString(), "x")).toBe(false);
  });
  test("init is once", () => {
    const a = new Y.Doc();
    initSpaceDoc(a, { text: "a", createdAt: 1 });
    initSpaceDoc(a, { text: "b", createdAt: 2 });
    expect(scriptText(a).toString()).toBe("a");
  });
  test("strReplace", () => {
    const a = new Y.Doc();
    initSpaceDoc(a, { text: "exec 1\nexec 2\nexec 1", createdAt: 1 });
    expect(strReplace(scriptText(a), "exec 2", "exec 3", "x")).toEqual({
      ok: true,
    });
    expect(scriptText(a).toString()).toBe("exec 1\nexec 3\nexec 1");
    expect(strReplace(scriptText(a), "exec 1", "y", "x").ok).toBe(false);
    expect(strReplace(scriptText(a), "nope", "y", "x").ok).toBe(false);
    expect(strReplace(scriptText(a), "", "y", "x").ok).toBe(false);
  });
});

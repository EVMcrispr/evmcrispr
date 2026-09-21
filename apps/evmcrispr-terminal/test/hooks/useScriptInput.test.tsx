import { describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useNavigate } from "react-router";
import { stdinFromUrl, useScriptInput } from "../../src/hooks/useScriptInput";

describe("URL stdin", () => {
  it("decodes URL text once, preserving empty input and distinguishing missing input", () => {
    const text = '{"nonce":"9007199254740993","text":"café 🚀 + %20 & #"}\n';
    expect(stdinFromUrl(`?${new URLSearchParams({ stdin: text })}`)).toBe(text);
    expect(stdinFromUrl("?stdin=", "?stdin=fallback")).toBe("");
    expect(stdinFromUrl("?mode=view", "?stdin=document")).toBe("document");
    expect(stdinFromUrl("?stdin=route", "?stdin=document")).toBe("route");
    expect(stdinFromUrl("?mode=view")).toBeUndefined();
  });

  it("updates on navigation and permits explicit replacement or clearing for the current script", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/script?stdin=first"]}>
        {children}
      </MemoryRouter>
    );
    const { result, rerender } = renderHook(
      ({ scriptId }) => ({
        ...useScriptInput(scriptId),
        navigate: useNavigate(),
      }),
      { wrapper, initialProps: { scriptId: "one" } },
    );
    expect(result.current.input).toEqual({
      name: "URL input",
      text: "first",
      source: "url",
    });
    act(() => result.current.setInput({ name: "file.json", text: "selected" }));
    expect(result.current.input?.text).toBe("selected");
    act(() => result.current.setInput(undefined));
    expect(result.current.input).toBeUndefined();
    act(() => result.current.navigate("/script?stdin=second"));
    expect(result.current.input?.text).toBe("second");
    act(() => result.current.setInput({ name: "file.json", text: "private" }));
    rerender({ scriptId: "two" });
    expect(result.current.input?.text).toBe("second");
    act(() => result.current.navigate("/script"));
    expect(result.current.input).toBeUndefined();
  });
});

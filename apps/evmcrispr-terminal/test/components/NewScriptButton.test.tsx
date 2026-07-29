import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import NewScriptButton from "../../src/components/scripts/NewScriptButton";
import {
  SCRIPT_PLACEHOLDER,
  terminalStoreActions,
  terminalStoreGet,
} from "../../src/stores/terminal-store";
import {
  createScript,
  getAllScripts,
  getLastViewedScript,
} from "../../src/utils/local-storage";
import { renderWithRouter } from "../setup/test-utils";

beforeEach(() => {
  localStorage.clear();
  terminalStoreActions("currentScriptId", null);
  terminalStoreActions("title", "");
  terminalStoreActions("script", "");
});

describe("NewScriptButton", () => {
  test("renders a button with the correct aria-label", () => {
    renderWithRouter(<NewScriptButton />);

    const btn = screen.getByRole("button", { name: "New script" });
    expect(btn).toBeInTheDocument();
  });

  test("clicking creates a new script in localStorage", () => {
    const oldId = createScript("Existing", "old code");
    terminalStoreActions("currentScriptId", oldId);
    terminalStoreActions("title", "Existing");
    terminalStoreActions("script", "old code");

    renderWithRouter(<NewScriptButton />);
    fireEvent.click(screen.getByRole("button", { name: "New script" }));

    const all = getAllScripts();
    expect(all.length).toBe(2);

    const newScript = all.find((s) => s.id !== oldId);
    expect(newScript).toBeDefined();
    expect(newScript!.title).toBe("");
    expect(newScript!.script).toBe(SCRIPT_PLACEHOLDER);
  });

  test("clicking reuses an existing pristine script instead of creating another", () => {
    const oldId = createScript("Existing", "old code");
    const pristineId = createScript("", SCRIPT_PLACEHOLDER);
    terminalStoreActions("currentScriptId", oldId);
    terminalStoreActions("title", "Existing");
    terminalStoreActions("script", "old code");

    renderWithRouter(<NewScriptButton />);
    fireEvent.click(screen.getByRole("button", { name: "New script" }));

    expect(getAllScripts().length).toBe(2);
    expect(terminalStoreGet("currentScriptId")).toBe(pristineId);
  });

  test("clicking resets the store to a new script", () => {
    const oldId = createScript("Existing", "old code");
    terminalStoreActions("currentScriptId", oldId);
    terminalStoreActions("title", "Existing");
    terminalStoreActions("script", "old code");

    renderWithRouter(<NewScriptButton />);
    fireEvent.click(screen.getByRole("button", { name: "New script" }));

    const newId = terminalStoreGet("currentScriptId");
    expect(newId).not.toBe(oldId);
    expect(newId).toBeTruthy();
    expect(terminalStoreGet("title")).toBe("");
    expect(terminalStoreGet("script")).toBe(SCRIPT_PLACEHOLDER);
  });

  test("clicking sets lastViewedScript to the new ID", () => {
    renderWithRouter(<NewScriptButton />);
    fireEvent.click(screen.getByRole("button", { name: "New script" }));

    const newId = terminalStoreGet("currentScriptId");
    expect(getLastViewedScript()).toBe(newId);
  });
});

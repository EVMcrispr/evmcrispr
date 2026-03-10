import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { LibraryTab } from "../../src/components/panel/LibraryTab";
import { useLibraryStore } from "../../src/stores/library-store";
import {
  createScript,
  getAllScripts,
  saveScript,
} from "../../src/utils/local-storage";
import { renderWithRouter } from "../setup/test-utils";

let ids: string[];

beforeEach(() => {
  localStorage.clear();
  useLibraryStore.setState({ scripts: [] });

  ids = [
    createScript("Alpha Script", "code alpha"),
    createScript("Beta Script", "code beta"),
    createScript("Gamma Script", "code gamma"),
  ];

  // Ensure distinct updatedAt by re-saving with tiny gaps
  saveScript(ids[0], "Alpha Script", "code alpha");
  saveScript(ids[1], "Beta Script", "code beta");
  saveScript(ids[2], "Gamma Script", "code gamma");
});

describe("LibraryTab", () => {
  test("renders all scripts", () => {
    renderWithRouter(<LibraryTab />);

    expect(screen.getByText("Alpha Script")).toBeInTheDocument();
    expect(screen.getByText("Beta Script")).toBeInTheDocument();
    expect(screen.getByText("Gamma Script")).toBeInTheDocument();
  });

  test("filters scripts when typing in the search input", () => {
    renderWithRouter(<LibraryTab />);

    const searchInput = screen.getByPlaceholderText("Search");
    fireEvent.change(searchInput, { target: { value: "beta" } });

    expect(screen.getByText("Beta Script")).toBeInTheDocument();
    expect(screen.queryByText("Alpha Script")).not.toBeInTheDocument();
    expect(screen.queryByText("Gamma Script")).not.toBeInTheDocument();
  });

  test("removing a script removes it from localStorage and the list", () => {
    renderWithRouter(<LibraryTab />);

    // Find all remove buttons
    const removeButtons = screen.getAllByRole("button", {
      name: "Remove saved script",
    });
    expect(removeButtons.length).toBe(3);

    // Remove the first visible script
    fireEvent.click(removeButtons[0]);

    // Should now have 2 scripts in localStorage
    expect(getAllScripts().length).toBe(2);

    // The list should re-render with 2 items
    const remainingButtons = screen.getAllByRole("button", {
      name: "Remove saved script",
    });
    expect(remainingButtons.length).toBe(2);
  });

  test('shows "No scripts saved yet." when registry is empty', () => {
    localStorage.clear();
    useLibraryStore.setState({ scripts: [] });
    renderWithRouter(<LibraryTab />);

    expect(screen.getByText("No scripts saved yet.")).toBeInTheDocument();
  });
});

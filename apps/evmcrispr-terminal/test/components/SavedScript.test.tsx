import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { SavedScript } from "../../src/components/scripts/SavedScript";
import type { StoredScript } from "../../src/types/index";
import { renderWithProviders } from "../setup/test-utils";

const baseScript: StoredScript = {
  id: "abc-123",
  title: "My Test Script",
  script: "load aragonos",
  createdAt: "2024-06-15T12:00:00.000Z",
  updatedAt: "2024-06-15T12:00:00.000Z",
};

beforeEach(() => {
  localStorage.clear();
});

describe("SavedScript", () => {
  test("displays the script title", () => {
    const onClick = mock(() => {});
    const onRemove = mock(() => {});

    renderWithProviders(
      <SavedScript
        script={baseScript}
        onItemClick={onClick}
        onItemRemove={onRemove}
      />,
    );

    expect(screen.getByText("My Test Script")).toBeInTheDocument();
  });

  test('displays "Untitled" when title is empty', () => {
    const untitled: StoredScript = { ...baseScript, title: "" };
    const onClick = mock(() => {});
    const onRemove = mock(() => {});

    renderWithProviders(
      <SavedScript
        script={untitled}
        onItemClick={onClick}
        onItemRemove={onRemove}
      />,
    );

    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  test("displays the formatted date", () => {
    const onClick = mock(() => {});
    const onRemove = mock(() => {});

    renderWithProviders(
      <SavedScript
        script={baseScript}
        onItemClick={onClick}
        onItemRemove={onRemove}
      />,
    );

    expect(screen.getByText(/15, 2024/)).toBeInTheDocument();
  });

  test("calls onItemClick with id when the card is clicked", () => {
    const onClick = mock(() => {});
    const onRemove = mock(() => {});

    renderWithProviders(
      <SavedScript
        script={baseScript}
        onItemClick={onClick}
        onItemRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByText("My Test Script"));
    expect(onClick).toHaveBeenCalledWith("abc-123");
  });

  test("calls onItemRemove with id when trash button is clicked", () => {
    const onClick = mock(() => {});
    const onRemove = mock(() => {});

    renderWithProviders(
      <SavedScript
        script={baseScript}
        onItemClick={onClick}
        onItemRemove={onRemove}
      />,
    );

    const removeBtn = screen.getByRole("button", {
      name: "Remove saved script",
    });
    fireEvent.click(removeBtn);

    expect(onRemove).toHaveBeenCalledWith("abc-123");
  });

  test("trash click does not trigger the parent onItemClick", () => {
    const onClick = mock(() => {});
    const onRemove = mock(() => {});

    renderWithProviders(
      <SavedScript
        script={baseScript}
        onItemClick={onClick}
        onItemRemove={onRemove}
      />,
    );

    const removeBtn = screen.getByRole("button", {
      name: "Remove saved script",
    });
    fireEvent.click(removeBtn);

    expect(onClick).not.toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

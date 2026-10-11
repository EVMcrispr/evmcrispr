import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SpaceMeta } from "@evmcrispr/space";
import { fireEvent, screen } from "@testing-library/react";
import { SavedScript } from "../../src/components/scripts/SavedScript";
import { renderWithProviders } from "../setup/test-utils";

const baseScript: SpaceMeta = {
  id: "abc-123",
  title: "My Test Script",
  createdAt: Date.UTC(2024, 5, 15, 12),
  updatedAt: Date.UTC(2024, 5, 15, 12),
  unreviewed: false,
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
        space={baseScript}
        onItemClick={onClick}
        onItemRemove={onRemove}
      />,
    );

    expect(screen.getByText("My Test Script")).toBeInTheDocument();
  });

  test("displays the formatted date", () => {
    const onClick = mock(() => {});
    const onRemove = mock(() => {});

    renderWithProviders(
      <SavedScript
        space={baseScript}
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
        space={baseScript}
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
        space={baseScript}
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
        space={baseScript}
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

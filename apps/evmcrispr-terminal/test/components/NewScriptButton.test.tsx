import { describe, expect, test } from "bun:test";
import { Tooltip } from "@repo/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import NewScriptButton from "../../src/components/scripts/NewScriptButton";

describe("NewScriptButton", () => {
  test("a click goes to the address that makes, or reuses, the placeholder space", () => {
    render(
      <Tooltip.Provider>
        <MemoryRouter initialEntries={["/abc"]}>
          <Routes>
            <Route path="/" element={<p>the placeholder space</p>} />
            <Route path=":id" element={<NewScriptButton />} />
          </Routes>
        </MemoryRouter>
      </Tooltip.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "New script" }));
    expect(screen.getByText("the placeholder space")).toBeInTheDocument();
  });
});

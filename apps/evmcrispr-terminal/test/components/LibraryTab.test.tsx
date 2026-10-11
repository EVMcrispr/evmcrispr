import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { LibraryTab } from "../../src/components/panel/LibraryTab";
import { testBrowser } from "../helpers/app";
import { renderWithApp } from "../setup/test-utils";

describe("LibraryTab", () => {
  test("lists the browser's spaces by title and filters them", async () => {
    const app = testBrowser().tab();
    await app.spaces.create({ text: "# Pay the team\nexec 1", source: "user" });
    await app.spaces.create({ text: "exec 2", source: "user" });
    renderWithApp(<LibraryTab />, { app });

    expect(screen.getByText("Pay the team")).toBeInTheDocument();
    expect(screen.getByText("Untitled · exec 2")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "pay" },
    });
    expect(screen.queryByText("Untitled · exec 2")).not.toBeInTheDocument();
  });

  test("removing a space removes it from the list and from storage", async () => {
    const app = testBrowser().tab();
    const id = await app.spaces.create({
      text: "# Gone\nexec 1",
      source: "user",
    });
    renderWithApp(<LibraryTab />, { app });

    fireEvent.click(screen.getByLabelText("Remove saved script"));
    await waitFor(() =>
      expect(screen.queryByText("Gone")).not.toBeInTheDocument(),
    );
    expect(await app.storage.records.getSpace(id)).toBeUndefined();
  });

  test("a space added in another tab appears", async () => {
    const browser = testBrowser();
    const [here, there] = [browser.tab(), browser.tab()];
    renderWithApp(<LibraryTab />, { app: here });
    await there.spaces.create({
      text: "# From the other tab\nexec 1",
      source: "user",
    });
    await waitFor(() =>
      expect(screen.getByText("From the other tab")).toBeInTheDocument(),
    );
  });
});

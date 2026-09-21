import { describe, expect, it, mock, spyOn } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ScriptIO } from "../../src/components/execution/ScriptIO";

const stubPicker = () =>
  spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});

describe("script stdin", () => {
  it("waits for the user to choose a file and keeps its exact contents in memory", async () => {
    const network = spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("No uploads"),
    );
    const choose = stubPicker();
    const onChange = mock(() => {});
    try {
      render(<ScriptIO onChange={onChange} />);
      expect(choose).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole("button", { name: "Choose stdin file" }),
      );
      expect(choose).toHaveBeenCalledTimes(1);
      fireEvent.change(screen.getByLabelText("Script input file"), {
        target: { files: [new File(["café 🚀\n"], "draft.json")] },
      });
      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith({
          name: "draft.json",
          text: "café 🚀\n",
        }),
      );
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
      choose.mockRestore();
    }
  });

  it("preserves the selected input on cancellation and supports explicitly clearing it", () => {
    const onChange = mock(() => {});
    render(
      <ScriptIO input={{ name: "empty.txt", text: "" }} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText("Script input file"), {
      target: { files: [] },
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("empty.txt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear stdin" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("shows the selected file's size in UTF-8 bytes next to its name", () => {
    render(
      <ScriptIO
        input={{ name: "draft.json", text: "café" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("5 B")).toBeInTheDocument();
  });

  it("replaces the file by clicking its chip", () => {
    const choose = stubPicker();
    try {
      render(
        <ScriptIO
          input={{ name: "draft.json", text: "{}" }}
          onChange={() => {}}
        />,
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Replace stdin file draft.json" }),
      );
      expect(choose).toHaveBeenCalledTimes(1);
    } finally {
      choose.mockRestore();
    }
  });

  it("refuses a binary file and keeps the previous input", async () => {
    const onChange = mock(() => {});
    render(
      <ScriptIO
        input={{ name: "draft.json", text: "{}" }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Script input file"), {
      target: {
        files: [
          new File(
            [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff])],
            "scan.pdf",
          ),
        ],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "scan.pdf is not UTF-8 text",
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("draft.json")).toBeInTheDocument();
  });

  it("labels input that came from the link instead of showing a file name", () => {
    render(
      <ScriptIO
        input={{ name: "URL input", text: "hi", source: "url" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("from URL")).toBeInTheDocument();
    expect(screen.queryByText("URL input")).not.toBeInTheDocument();
  });

  it("explains why stdin is locked while a script runs", () => {
    render(
      <ScriptIO
        input={{ name: "draft.json", text: "{}" }}
        onChange={() => {}}
        disabled
      />,
    );
    const chip = screen.getByRole("button", {
      name: "Replace stdin file draft.json",
    });
    expect(chip).toBeDisabled();
    expect(chip).toHaveAttribute(
      "title",
      "stdin is locked while the script runs",
    );
    expect(screen.getByRole("button", { name: "Clear stdin" })).toBeDisabled();
  });
});

describe("script stdout", () => {
  it("offers nothing until the script prints", () => {
    render(<ScriptIO onChange={() => {}} />);
    expect(
      screen.queryByRole("button", { name: "Download stdout" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy stdout" })).toBeNull();
  });

  it("summarises the print stream by size and line count", () => {
    render(<ScriptIO onChange={() => {}} output={"hola\nmón\n"} />);
    expect(screen.getByText("10 B · 2 lines")).toBeInTheDocument();
  });

  it("counts a single print as one line", () => {
    render(<ScriptIO onChange={() => {}} output={"hola\n"} />);
    expect(screen.getByText("5 B · 1 line")).toBeInTheDocument();
  });

  it("downloads the exact print stream as output.txt", async () => {
    let blob: Blob | undefined;
    const create = spyOn(URL, "createObjectURL").mockImplementation((b) => {
      blob = b as Blob;
      return "blob:stdout";
    });
    const click = spyOn(
      HTMLAnchorElement.prototype,
      "click",
    ).mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("output.txt");
    });
    try {
      render(<ScriptIO onChange={() => {}} output={"hola\n"} />);
      fireEvent.click(screen.getByRole("button", { name: "Download stdout" }));
      expect(click).toHaveBeenCalledTimes(1);
      expect(await blob?.text()).toBe("hola\n");
    } finally {
      create.mockRestore();
      click.mockRestore();
    }
  });

  it("copies the exact print stream and confirms it", async () => {
    const writeText = mock(async () => {});
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      render(<ScriptIO onChange={() => {}} output={"hola\n"} />);
      fireEvent.click(screen.getByRole("button", { name: "Copy stdout" }));
      expect(writeText).toHaveBeenCalledWith("hola\n");
      expect(
        await screen.findByRole("button", { name: "Copied stdout" }),
      ).toBeInTheDocument();
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});

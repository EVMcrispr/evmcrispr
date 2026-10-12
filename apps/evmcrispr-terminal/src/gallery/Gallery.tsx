import { Toaster } from "@repo/ui";
import type { ComponentType } from "react";
import { Buttons } from "./sections/Buttons";
import { Cards } from "./sections/Cards";
import { Chrome } from "./sections/Chrome";
import { Compositions } from "./sections/Compositions";
import { Foundations } from "./sections/Foundations";
import { Marks } from "./sections/Marks";
import { Overlays } from "./sections/Overlays";
import { Primitives } from "./sections/Primitives";
import { Rows } from "./sections/Rows";
import { Transactions } from "./sections/Transactions";

/** The sections, in page order. A component is added here with the
 *  commit that adds it to @repo/ui. */
const SECTIONS: { id: string; title: string; Component: ComponentType }[] = [
  { id: "foundations", title: "Foundations", Component: Foundations },
  { id: "buttons", title: "Buttons", Component: Buttons },
  { id: "marks", title: "Badges and chips", Component: Marks },
  { id: "rows", title: "Rows", Component: Rows },
  { id: "cards", title: "Cards and wells", Component: Cards },
  { id: "transactions", title: "Transactions", Component: Transactions },
  { id: "chrome", title: "Headers, notices, fields", Component: Chrome },
  { id: "overlays", title: "Overlays", Component: Overlays },
  { id: "primitives", title: "Menus, tabs, toasts", Component: Primitives },
  { id: "compositions", title: "Compositions", Component: Compositions },
];

export function Gallery() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col px-4 pb-24">
      <header className="flex flex-col gap-3 py-8">
        <h1 className="font-head text-display font-bold text-heading">
          EVMcrispr UI gallery
        </h1>
        <nav aria-label="Sections" className="flex flex-wrap gap-x-4 gap-y-1">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="font-sans text-body text-primary underline-offset-2 hover:underline"
            >
              {section.title}
            </a>
          ))}
        </nav>
      </header>
      {SECTIONS.map(({ id, Component }) => (
        <Component key={id} />
      ))}
      <Toaster />
    </main>
  );
}

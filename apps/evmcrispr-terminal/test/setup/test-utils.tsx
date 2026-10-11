import { Tooltip } from "@repo/ui";
import {
  type RenderOptions,
  type RenderResult,
  render,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { AppProvider } from "../../src/app/AppContext";
import type { App } from "../../src/app/boot";
import { SpaceProvider } from "../../src/app/SpaceContext";
import type { LiveSpace } from "../../src/space/live-space";

function Providers({
  children,
  route = "/",
}: {
  children: ReactNode;
  route?: string;
}) {
  return (
    <Tooltip.Provider>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </Tooltip.Provider>
  );
}

export function renderWithRouter(
  ui: ReactNode,
  { route = "/", ...options }: RenderOptions & { route?: string } = {},
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => <Providers route={route}>{children}</Providers>,
    ...options,
  });
}

export function renderWithProviders(
  ui: ReactNode,
  options?: RenderOptions,
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => <Tooltip.Provider>{children}</Tooltip.Provider>,
    ...options,
  });
}

/** Renders inside an App object, as the terminal's components expect. */
export function renderWithApp(
  ui: ReactNode,
  { app, route = "/" }: { app: App; route?: string },
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <AppProvider app={app}>
        <Providers route={route}>{children}</Providers>
      </AppProvider>
    ),
  });
}

/** Renders with `space` on screen, as the terminal's route does. */
export function renderInSpace(
  ui: ReactNode,
  { app, space }: { app: App; space: LiveSpace | null },
): RenderResult {
  return renderWithApp(<SpaceProvider value={space}>{ui}</SpaceProvider>, {
    app,
  });
}

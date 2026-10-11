import { Button, PixelArt } from "@repo/ui";
import type { ComponentProps, ReactNode } from "react";
import { useNavigate, useRouteError } from "react-router";

const said = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function Crash({
  art,
  title,
  children,
  actions,
}: {
  art: ComponentProps<typeof PixelArt>["name"];
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-8 px-6"
    >
      <PixelArt name={art} />
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <h2 className="m-0 font-head text-display tracking-wide text-heading">
          {title}
        </h2>
        {children}
      </div>
      <div className="flex flex-wrap justify-center gap-3">{actions}</div>
    </div>
  );
}

const reload = (
  <Button variant="neutral" onClick={() => window.location.reload()}>
    Reload
  </Button>
);

/** What the page shows when storage could not be opened: never a blank
 *  page. Old scripts are untouched. */
export function BootFailed({ error }: { error: unknown }) {
  return (
    <Crash art="flatline" title="EVMcrispr could not start" actions={reload}>
      <p className="m-0 font-mono text-body text-fg-muted">{said(error)}</p>
    </Crash>
  );
}

/** What a route shows when drawing it threw. Nothing was sent, and what
 *  is stored is as it was. */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  return (
    <Crash
      art="bug"
      title="Bad Mutation Detected"
      actions={
        <>
          {reload}
          <Button variant="quiet" onClick={() => navigate("/")}>
            New space
          </Button>
        </>
      }
    >
      <p className="m-0 font-mono text-body text-fg-muted">
        Something in the page broke while drawing this screen. Your spaces are
        stored as they were.
      </p>
      <p className="m-0 font-mono text-caption text-fg-faint">{said(error)}</p>
    </Crash>
  );
}

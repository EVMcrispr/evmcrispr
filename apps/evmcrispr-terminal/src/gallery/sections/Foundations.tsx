// By path: the app aliases `@evmcrispr/editor` to its entry file, and
// an alias does not match a specifier with a query.
import theme from "../../../../../packages/editor/src/styles/theme.css?raw";
import tokens from "../../../../../packages/editor/src/styles/tokens.css?raw";
import { Both, Example, Section } from "../kit";

/** Every token whose value is a colour, in the order of the file. */
const COLOURS = [...tokens.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)]
  .filter(([, , value]) => /^(#|rgba?\(|color-mix\()/.test(value.trim()))
  .map(([, name]) => name);

/** The type sizes the theme defines: caption, body, title, display. */
const SIZES = [...theme.matchAll(/^\s*--text-(\w+)\s*:/gm)].map(
  ([, name]) => name,
);

const SIZE_CLASS: Record<string, string> = {
  caption: "text-caption",
  body: "text-body",
  title: "text-title",
  display: "text-display",
};

export function Foundations() {
  return (
    <Section
      id="foundations"
      title="Foundations"
      note="The tokens everything else is built from. App code uses these names, never the palette or an opacity step."
    >
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {COLOURS.map((name) => (
          <li key={name} className="flex flex-col gap-1">
            <span
              className="h-10 border-2 border-edge"
              style={{ background: `var(${name})` }}
            />
            <span className="font-mono text-caption text-fg-muted">
              {name.slice(2)}
            </span>
          </li>
        ))}
      </ul>
      <Both>
        <Example label="type scale">
          <div className="flex flex-col gap-2">
            {SIZES.map((size) => (
              <span
                key={size}
                className={`font-sans text-fg ${SIZE_CLASS[size] ?? ""}`}
              >
                {size}: Rewrite your transactions' DNA
              </span>
            ))}
          </div>
        </Example>
        <Example label="text">
          <span className="font-sans text-body text-fg">fg</span>
          <span className="font-sans text-body text-fg-muted">fg-muted</span>
          <span className="font-sans text-body text-fg-faint">fg-faint</span>
        </Example>
        <Example label="touch variant">
          <span
            data-touch-probe
            className="inline-flex items-center border-2 border-edge px-2 font-sans text-caption text-fg-muted touch:min-h-11"
          >
            44px tall on touch
          </span>
        </Example>
      </Both>
    </Section>
  );
}

import { cn } from "../utils";

// One character is one pixel; "." is empty. Every row of a drawing is as
// wide as the first.
const HELIX = [
  ".......yy.......",
  ".....bb..yy.....",
  "...bbpppgggyy...",
  ".bb..........yy.",
  ".bbpppppgggggyy.",
  ".bb..........yy.",
  "...bbpppgggyy...",
  ".....bb..yy.....",
  ".......bb.......",
  ".....yy..bb.....",
  "...yygggpppbb...",
  ".yy..........bb.",
  ".yygggggpppppbb.",
  ".yy..........bb.",
  "...yygggpppbb...",
  ".....yy..bb.....",
  ".......yy.......",
  ".....bb..yy.....",
  "...bbpppgggyy...",
  ".bb..........yy.",
  ".bbpppppgggggyy.",
  ".bb..........yy.",
  "...bbpppgggyy...",
  ".....bb..yy.....",
];

const BROKEN_VIAL = [
  "................",
  "....mmmmmmmmmm..",
  "....mmmmmmmmmm..",
  ".....m......m...",
  ".....m.w....m...",
  ".....m.w....m...",
  ".....m.w....m...",
  ".....m......m...",
  ".....mm.mm.mm...",
  "......m..m..m...",
  "........p.......",
  "....m..m..m.....",
  "....mm.mm.mmp...",
  "....mppppppmp...",
  "....mpwppppm....",
  "....mpwppppmp...",
  "....mppppppm....",
  "....mppppppmp...",
  ".....mmmmmm.....",
  "..pppppppppppp..",
  ".pppwwppppppppp.",
  "...pppppppppp...",
  "................",
  "................",
];

const SEALED_VIAL = [
  "................",
  ".....pppppp.....",
  "....pppppppp....",
  "....pwwppppp....",
  "...pppppppppp...",
  "...pppppppppp...",
  "....ppp.pp.pp...",
  "....pp..p..mp...",
  "....mp.....m....",
  "....m.w....m....",
  "....mbbbbbbm....",
  "....mbwbbbbm....",
  "....mbwbbbbm....",
  "....mbbbbbbm....",
  "....mbbbbbbm....",
  "....mbbbbbbm....",
  "....mbbbbbbm....",
  "....mbbbbbbm....",
  "....mbbbbbbm....",
  "....mbbbbbbm....",
  "....mbbbbbbm....",
  "....mbbbbbbm....",
  ".....mmmmmm.....",
  "................",
];

const CRATE = [
  "................",
  "................",
  "................",
  "...mmmm..mmmm...",
  "...m..m..m..m...",
  "...mggm..mbbm...",
  "...mggm..mbbm...",
  "oooooooooooooooo",
  "oooooooooooooooo",
  ".oooooooooooooo.",
  ".oooooooooooooo.",
  ".o............o.",
  ".oooooooooooooo.",
  ".oooooyyyyooooo.",
  ".oooooyyyyooooo.",
  ".oooooooooooooo.",
  ".o............o.",
  ".oooooooooooooo.",
  ".oooooooooooooo.",
  "oooooooooooooooo",
  "oooooooooooooooo",
  "................",
  "................",
  "................",
];

const FLATLINE = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "mmmmmmmmmmmmmmmm",
  "m..............m",
  "m..............m",
  "m......p.......m",
  "m.....p.p......m",
  "m.pppp...ppppp.m",
  "m..............m",
  "m..............m",
  "mmmmmmmmmmmmmmmm",
  "......mmmm......",
  "......mmmm......",
  "....mmmmmmmm....",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];

const BUG = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "...m........m...",
  "....m......m....",
  ".....m....m.....",
  "......pppp......",
  ".....pkppkp.....",
  ".m...pppppp...m.",
  "..mmgggyygggmm..",
  "....gggyyggg....",
  "mmmmgggyygggmmmm",
  "....gggyyggg....",
  "..mmgggyygggmm..",
  ".m...ggyygg...m.",
  ".m....gyyg....m.",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];

const DRAWINGS = {
  helix: HELIX,
  "broken-vial": BROKEN_VIAL,
  "sealed-vial": SEALED_VIAL,
  crate: CRATE,
  flatline: FLATLINE,
  bug: BUG,
};

/** The helix repeats every 16 rows: drawn that much longer and slid up
 *  by as much, it turns without a seam. */
const HELIX_TURN = 16;

// Written out in full: Tailwind finds class names by reading the source.
const INK: Record<string, string> = {
  y: "fill-heading",
  g: "fill-success",
  p: "fill-danger",
  b: "fill-info",
  o: "fill-unverified",
  w: "fill-fg",
  m: "fill-fg-muted",
  k: "fill-surface-0",
};

/** The pixels of one colour as a path: a 1-high rectangle per run. */
function runs(rows: string[], ink: string): string {
  let path = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== ink) continue;
      let end = x;
      while (row[end + 1] === ink) end++;
      const width = end - x + 1;
      path += `M${x} ${y}h${width}v1h-${width}z`;
      x = end;
    }
  });
  return path;
}

interface PixelArtProps {
  name: keyof typeof DRAWINGS;
  /** Given when the drawing says something the words beside it do not. */
  label?: string;
  /** The helix turns while something is being fetched. The other
   *  drawings stay still. */
  turning?: boolean;
  className?: string;
}

/** A drawing in the brand colours, six screen pixels to one of its own.
 *  Beside a title it is decoration. */
export function PixelArt({
  name,
  label,
  turning = false,
  className,
}: PixelArtProps) {
  const rows = DRAWINGS[name];
  const turns = turning && name === "helix";
  const drawn = turns ? [...rows, ...rows.slice(-HELIX_TURN)] : rows;
  return (
    <svg
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("h-36 w-24 shrink-0", className)}
    >
      <g className={turns ? "motion-safe:animate-helix-turn" : undefined}>
        {Object.entries(INK).map(([ink, fill]) => {
          const d = runs(drawn, ink);
          return d && <path key={ink} d={d} className={fill} />;
        })}
      </g>
    </svg>
  );
}

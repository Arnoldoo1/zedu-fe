/**
 * The office's one colour language, taken from the reference tower: cream
 * plaster, warm wood, green accent and daylight blue on the screens.
 *
 * The tower cutaway and the walk-in floor are the same building, so both read
 * their materials from here. A colour that appears in only one of the two views
 * is a bug: it means the room looks different from the street than it does from
 * inside it.
 */
export const PALETTE = {
  // Structure: mullions, slabs and the frame around a window.
  frame: 0x33433d,
  frameDark: 0x1f2b27,
  slab: 0x40514a,
  slabTint: 0x5f7d6c,
  // Surfaces.
  wall: 0xf3ecdf,
  wallShade: 0xe3d7c5,
  wood: 0xb88d67,
  woodDark: 0x6f5541,
  desk: 0x745a43,
  screen: 0x9fd8e8,
  leaf: 0x5c9560,
  pot: 0xc38a64,
  glow: 0xffdda2,
  accent: 0x2d7663,
  site: 0xe1ebe5,
  skyline: 0xd3dfd9,
  // Interior-only surfaces the cutaway never shows.
  stone: 0xded7c8,
  carpet: 0xa89f8d,
  terrazzo: 0xe8e1d3,
  metal: 0x9aa4ac,
  ink: 0x1b2320,
  lightWarm: 0xffe7bd,
  sofa: 0x7c91a4,
  counter: 0x88684c,
};

/** Canvas signage is drawn in CSS colours, not THREE ones. */
export const INK_CSS = "#1b2320";
export const PAPER_CSS = "#f3ecdf";

// Third-party code: icons copied from Excalidraw (MIT License, Copyright
// (c) 2020 Excalidraw), most of them Tabler Icons (MIT License, Copyright
// (c) 2020-2026 Paweł Kuna). Full licence texts: THIRD_PARTY_LICENSES at
// the repo root.

import type { ReactElement, SVGProps } from "react";

// The toolbar's icons, copied from Excalidraw's own
// (packages/excalidraw/components/icons.tsx, commit 1d4dc2c), each with
// its own stroke width as there. Board, Map and Markup have none in
// Excalidraw: drawn here in the same style (20-unit box, 1.25 stroke).

type Opts = SVGProps<SVGSVGElement> & { width: number; height: number };

const icon = (d: ReactElement, { width, height, ...rest }: Opts) => (
  <svg aria-hidden="true" focusable="false" role="img" viewBox={`0 0 ${width} ${height}`} {...rest}>
    {d}
  </svg>
);

const tabler: Opts = { width: 24, height: 24, fill: "none", strokeWidth: 2, stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" };
const modifiedTabler: Opts = { width: 20, height: 20, fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" };

const select = icon(
  <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M6 6l4.153 11.793a0.365 .365 0 0 0 .331 .207a0.366 .366 0 0 0 .332 -.207l2.184 -4.793l4.787 -1.994a0.355 .355 0 0 0 .213 -.323a0.355 .355 0 0 0 -.213 -.323l-11.787 -4.36z" />
    <path d="M13.5 13.5l4.5 4.5" />
  </g>,
  { fill: "none", width: 22, height: 22, strokeWidth: 1.25 },
);

const lasso = icon(
  <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}>
    <path d="M4.028 13.252c-.657 -.972 -1.028 -2.078 -1.028 -3.252c0 -3.866 4.03 -7 9 -7s9 3.134 9 7s-4.03 7 -9 7c-1.913 0 -3.686 -.464 -5.144 -1.255" />
    <path d="M5 15m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M5 17c0 1.42 .316 2.805 1 4" />
  </g>,
  { fill: "none", width: 22, height: 22, strokeWidth: 1.25 },
);

const rectangle = icon(
  <g strokeWidth="1.5">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </g>,
  tabler,
);

const arrow = icon(
  <g strokeWidth="1.5">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <line x1="5" y1="12" x2="19" y2="12" />
    <line x1="15" y1="16" x2="19" y2="12" />
    <line x1="15" y1="8" x2="19" y2="12" />
  </g>,
  tabler,
);

const line = icon(<path d="M4.167 10h11.666" strokeWidth="1.5" />, modifiedTabler);

const draw = icon(
  <g strokeWidth="1.25">
    <path clipRule="evenodd" d="m7.643 15.69 7.774-7.773a2.357 2.357 0 1 0-3.334-3.334L4.31 12.357a3.333 3.333 0 0 0-.977 2.357v1.953h1.953c.884 0 1.732-.352 2.357-.977Z" />
    <path d="m11.25 5.417 3.333 3.333" />
  </g>,
  modifiedTabler,
);

const text = icon(
  <g strokeWidth="1.5">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <line x1="4" y1="20" x2="7" y2="20" />
    <line x1="14" y1="20" x2="21" y2="20" />
    <line x1="6.9" y1="15" x2="13.8" y2="15" />
    <line x1="10.2" y1="6.3" x2="16" y2="20" />
    <polyline points="5 20 11 4 13 4 20 20" />
  </g>,
  tabler,
);

const image = icon(
  <g strokeWidth="1.25">
    <path d="M12.5 6.667h.01" />
    <path d="M4.91 2.625h10.18a2.284 2.284 0 0 1 2.285 2.284v10.182a2.284 2.284 0 0 1-2.284 2.284H4.909a2.284 2.284 0 0 1-2.284-2.284V4.909a2.284 2.284 0 0 1 2.284-2.284Z" />
    <path d="m3.333 12.5 3.334-3.333c.773-.745 1.726-.745 2.5 0l4.166 4.166" />
    <path d="m11.667 11.667.833-.834c.774-.744 1.726-.744 2.5 0l1.667 1.667" />
  </g>,
  modifiedTabler,
);

const embed = icon(
  <g strokeWidth="1.5">
    <polyline points="12 16 18 10 12 4" />
    <polyline points="8 4 2 10 8 16" />
  </g>,
  modifiedTabler,
);

/** tabler-icons: dots-vertical, Excalidraw's "More tools" (DotsIcon). */
export const dotsIcon = icon(
  <g strokeWidth="1.5">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
    <circle cx="12" cy="5" r="1" />
  </g>,
  tabler,
);

// Ours, in Excalidraw's style.
const board = icon(
  <g strokeWidth="1.25">
    <rect x="2.5" y="3.333" width="4.167" height="13.333" rx="1" />
    <rect x="7.917" y="3.333" width="4.167" height="9.167" rx="1" />
    <rect x="13.333" y="3.333" width="4.167" height="5.833" rx="1" />
  </g>,
  modifiedTabler,
);

const map = icon(
  <g strokeWidth="1.25">
    <rect x="2.083" y="2.917" width="6.667" height="4.583" rx="1" />
    <rect x="11.25" y="12.5" width="6.667" height="4.583" rx="1" />
    <path d="M5.417 7.5v5a2.083 2.083 0 0 0 2.083 2.083h3.75" />
  </g>,
  modifiedTabler,
);

const markup = icon(
  <g strokeWidth="1.25">
    <path d="m11.667 4.167 4.166 4.166-6.666 6.667H5v-4.167l6.667-6.666Z" />
    <path d="m10 5.833 4.167 4.167" />
    <path d="M3.333 17.5h13.334" />
  </g>,
  modifiedTabler,
);

export const TOOL_ICONS: Readonly<Record<string, ReactElement>> = {
  select,
  rectangle,
  arrow,
  line,
  board,
  map,
  asset: image,
  embed,
  lasso,
  markup,
  text,
  draw,
};

import { svgEl } from "./util";

const PATHS: Record<string, string> = {
  overview: "M4 5h7v6H4zM13 5h7v3h-7zM13 10h7v9h-7zM4 13h7v6H4z",
  twin: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  electrical: "M13 3L5 13h6l-1 8 8-10h-6z",
  cooling: "M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9M9 4.5l3 2.5 3-2.5M9 19.5l3-2.5 3 2.5",
  energy: "M4 19h16M6 19V11M11 19V6M16 19v-9M20 19v-5",
  reliability: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z M9 12l2.2 2.2L15.5 10",
  finance: "M4 18l5-6 4 3 7-9M15 6h5v5",
  scenario: "M5 6h14M5 12h14M5 18h14M9 4v4M15 10v4M8 16v4",
  docs: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6",
  project: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5v.5",
};

export function icon(name: string, size = 20): SVGElement {
  const svg = svgEl("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": 1.6,
    "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" });
  svg.append(svgEl("path", { d: PATHS[name] ?? PATHS.overview }));
  return svg;
}

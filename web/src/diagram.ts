import { svgEl } from "./util";

export interface BoxSpec { x: number; y: number; w: number; h: number; lines: string[]; id?: string; dim?: boolean[]; onSelect?: () => void; selected?: boolean }

// labelled node
export function box(svg: SVGElement, s: BoxSpec): SVGElement {
  const g = svgEl("g", { tabindex: s.onSelect ? 0 : undefined, role: s.onSelect ? "button" : undefined,
    "aria-label": s.lines.join(". ") });
  g.append(svgEl("rect", { x: s.x, y: s.y, width: s.w, height: s.h, rx: 6, class: `node${s.selected ? " sel" : ""}` }));
  s.lines.forEach((line, i) => {
    g.append(svgEl("text", { x: s.x + 12, y: s.y + 20 + i * 17, class: s.dim?.[i] ? "dim" : "", "font-weight": i === 0 ? 600 : 400 }, line));
  });
  if (s.onSelect) {
    g.addEventListener("click", s.onSelect);
    g.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ") { e.preventDefault(); s.onSelect!(); } });
  }
  svg.append(g);
  return g;
}

export function line(svg: SVGElement, points: [number, number][], cls: string) {
  svg.append(svgEl("path", { d: points.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(""), class: cls }));
}

export function label(svg: SVGElement, x: number, y: number, text: string, anchor = "start", dim = true) {
  svg.append(svgEl("text", { x, y, class: dim ? "dim" : "", "text-anchor": anchor }, text));
}

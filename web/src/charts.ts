import { compact, fixed, h, svgEl } from "./util";

export interface Series {
  name: string;
  values: (number | null)[];
  color?: string;
  kind?: "line" | "bar" | "area";
  dashed?: boolean;
  decimals?: number;
}

export interface ChartSpec {
  title: string;
  subtitle?: string;
  labels?: string[];
  xValues?: number[];
  xLabel: string;
  yLabel: string;
  unit: string;
  series: Series[];
  stacked?: boolean;
  source: string;
  decimals?: number;
  height?: number;
  yMin?: number;
  yMax?: number;
  xTick?: (i: number) => string;
  tickEvery?: number;
}

export const PALETTE = ["#38bdf8", "#7c9cff", "#f2b84b", "#6fcf97", "#e8829f", "#b79cf0", "#94a3b8", "#f2896b"];

// nice axis ticks
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) { max = min + 1; }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return ticks;
}

export function stackedTotals(series: Series[], i: number): { pos: number; neg: number } {
  let pos = 0, neg = 0;
  for (const s of series) {
    const v = s.values[i] ?? 0;
    if (v >= 0) pos += v; else neg += v;
  }
  return { pos, neg };
}

export function chart(spec: ChartSpec): HTMLElement {
  const hidden = new Set<string>();
  const n = spec.labels?.length ?? spec.xValues?.length ?? spec.series[0]?.values.length ?? 0;
  const colors = spec.series.map((s, i) => s.color ?? PALETTE[i % PALETTE.length]);
  const height = spec.height ?? 280;
  const svgBox = h("div", { class: "chart-svg" });
  const tip = h("div", { class: "chart-tip", role: "status", "aria-live": "polite" });
  tip.hidden = true;
  const legend = h("div", { class: "legend" });
  const root = h("figure", { class: "chart" },
    h("figcaption", {}, h("h3", {}, spec.title), spec.subtitle ? h("p", { class: "sub" }, spec.subtitle) : null),
    legend, h("div", { class: "chart-stage" }, svgBox, tip),
    h("p", { class: "source" }, `Source: ${spec.source}`));
  let cursor = -1;

  const visible = () => spec.series.map((s, i) => ({ s, i })).filter(({ s }) => !hidden.has(s.name));

  function domain(): [number, number] {
    let lo = Infinity, hi = -Infinity;
    const vis = visible();
    if (spec.stacked) {
      for (let i = 0; i < n; i++) {
        const t = stackedTotals(vis.map((v) => v.s), i);
        lo = Math.min(lo, t.neg); hi = Math.max(hi, t.pos);
      }
    } else {
      for (const { s } of vis) for (const v of s.values) if (v !== null && Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    const hasBars = vis.some(({ s }) => (s.kind ?? "line") !== "line");
    if (hasBars || lo > 0) lo = Math.min(lo, 0);
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (spec.yMin !== undefined) lo = spec.yMin;
    if (spec.yMax !== undefined) hi = spec.yMax;
    const pad = (hi - lo) * 0.04 || 1;
    return [spec.yMin !== undefined ? lo : (lo < 0 ? lo - pad : lo), spec.yMax !== undefined ? hi : hi + pad];
  }

  function draw() {
    const width = Math.max(280, svgBox.clientWidth || 640);
    const longest = Math.max(0, ...(spec.labels ?? []).map((t) => t.length));
    const m = { l: 68, r: 16, t: 12, b: (spec.xLabel ? 52 : 32) + (longest > 7 ? 24 : 0) };
    const iw = width - m.l - m.r, ih = height - m.t - m.b;
    const [d0, d1] = domain();
    const ticks = niceTicks(d0, d1, ih < 200 ? 4 : 5);
    const lo = Math.min(d0, ticks[0]), hi = Math.max(d1, ticks[ticks.length - 1]);
    const y = (v: number) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
    const linear = !!spec.xValues;
    const xMin = linear ? spec.xValues![0] : 0, xMax = linear ? spec.xValues![n - 1] : n;
    const x = (i: number) => linear
      ? m.l + ((spec.xValues![i] - xMin) / (xMax - xMin || 1)) * iw
      : m.l + ((i + 0.5) / n) * iw;
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img",
      "aria-label": `${spec.title}. ${spec.series.map((s) => s.name).join(", ")}. ${spec.yLabel} (${spec.unit}) by ${spec.xLabel}.` });
    // grid and y axis
    for (const t of ticks) {
      svg.append(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), class: t === 0 ? "axis-zero" : "grid" }));
      svg.append(svgEl("text", { x: m.l - 8, y: y(t) + 4, class: "tick", "text-anchor": "end" }, compact(t)));
    }
    svg.append(svgEl("text", { x: 14, y: m.t + ih / 2, class: "axis-title", "text-anchor": "middle", transform: `rotate(-90 14 ${m.t + ih / 2})` },
      `${spec.yLabel} (${spec.unit})`));
    // x ticks
    const every = spec.tickEvery ?? Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));
    const tickIdx: number[] = [];
    if (linear) {
      for (const t of niceTicks(xMin, xMax, Math.max(2, Math.floor(iw / 80)))) {
        if (t >= xMin && t <= xMax) {
          const px = m.l + ((t - xMin) / (xMax - xMin || 1)) * iw;
          svg.append(svgEl("text", { x: px, y: m.t + ih + 18, class: "tick", "text-anchor": "middle" }, compact(t)));
        }
      }
    } else {
      for (let i = 0; i < n; i += every) tickIdx.push(i);
      const texts = tickIdx.map((i) => (spec.xTick ? spec.xTick(i) : (spec.labels?.[i] ?? String(i))));
      const step = (iw / Math.max(1, n)) * every;
      const crowded = Math.max(...texts.map((t) => t.length)) * 6.6 > step;
      tickIdx.forEach((i, k) => {
        const ty = m.t + ih + 18;
        svg.append(crowded
          ? svgEl("text", { x: x(i), y: ty - 4, class: "tick", "text-anchor": "end", transform: `rotate(-35 ${x(i)} ${ty - 4})` }, texts[k])
          : svgEl("text", { x: x(i), y: ty, class: "tick", "text-anchor": "middle" }, texts[k]));
      });
    }
    if (spec.xLabel) svg.append(svgEl("text", { x: m.l + iw / 2, y: height - 8, class: "axis-title", "text-anchor": "middle" }, spec.xLabel));
    // marks
    const vis = visible();
    const barSeries = vis.filter(({ s }) => (s.kind ?? "line") === "bar");
    const slot = iw / Math.max(n, 1);
    const bw = Math.max(2, Math.min(40, slot * 0.7 / (spec.stacked ? 1 : Math.max(1, barSeries.length))));
    const posBase = new Array(n).fill(0), negBase = new Array(n).fill(0);
    const areaBase = new Array(n).fill(0);
    vis.forEach(({ s, i: si }) => {
      const kind = s.kind ?? "line";
      const color = colors[si];
      if (kind === "bar") {
        const bi = barSeries.findIndex((b) => b.i === si);
        s.values.forEach((v, i) => {
          if (v === null || !Number.isFinite(v)) return;
          let y0: number, y1: number, bx: number;
          if (spec.stacked) {
            const from = v >= 0 ? posBase[i] : negBase[i];
            if (v >= 0) posBase[i] += v; else negBase[i] += v;
            y0 = y(from); y1 = y(from + v); bx = x(i) - bw / 2;
          } else {
            y0 = y(0); y1 = y(v); bx = x(i) - (bw * barSeries.length) / 2 + bi * bw;
          }
          svg.append(svgEl("rect", { x: bx, y: Math.min(y0, y1), width: Math.max(1, bw - (spec.stacked ? 0 : 1)), height: Math.max(0.5, Math.abs(y1 - y0)), fill: color, opacity: 0.92 }));
        });
      } else {
        const pts: string[] = [];
        const tops: number[] = [];
        s.values.forEach((v, i) => {
          if (v === null || !Number.isFinite(v)) return;
          const base = spec.stacked && kind === "area" ? areaBase[i] : 0;
          const total = base + v;
          tops[i] = total;
          pts.push(`${pts.length ? "L" : "M"}${x(i).toFixed(1)},${y(total).toFixed(1)}`);
        });
        if (kind === "area") {
          const idx = tops.map((_, i) => i).filter((i) => tops[i] !== undefined);
          const up = idx.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(tops[i]).toFixed(1)}`);
          const back = [...idx].reverse().map((i) => `L${x(i).toFixed(1)},${y(spec.stacked ? areaBase[i] : 0).toFixed(1)}`);
          svg.append(svgEl("path", { d: `${up.join("")}${back.join("")}Z`, fill: color, opacity: 0.35 }));
          if (spec.stacked) idx.forEach((i) => { areaBase[i] = tops[i]; });
        }
        svg.append(svgEl("path", { d: pts.join(""), fill: "none", stroke: color, "stroke-width": 1.8, "stroke-linejoin": "round",
          "stroke-dasharray": s.dashed ? "6 4" : undefined }));
      }
    });
    // cursor
    const guide = svgEl("line", { y1: m.t, y2: m.t + ih, class: "guide", visibility: "hidden" });
    svg.append(guide);
    const overlay = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", tabindex: 0, class: "overlay",
      "aria-label": "Chart data cursor. Use left and right arrow keys." });
    svg.append(overlay);

    function show(i: number) {
      cursor = i;
      const px = x(i);
      guide.setAttribute("x1", String(px)); guide.setAttribute("x2", String(px)); guide.setAttribute("visibility", "visible");
      const label = spec.labels?.[i] ?? (spec.xValues ? `${spec.xLabel} ${fixed(spec.xValues[i], 2)}` : String(i));
      tip.replaceChildren(h("strong", {}, spec.xTick && !spec.labels ? spec.xTick(i) : label),
        ...vis.map(({ s, i: si }) => {
          const v = s.values[i];
          const d = s.decimals ?? spec.decimals ?? 2;
          return h("div", { class: "tip-row" }, h("i", { class: "swatch", style: `background:${colors[si]}` }), h("span", {}, s.name),
            h("b", {}, v === null || v === undefined ? "n/a" : `${fixed(v, d)} ${spec.unit}`));
        }));
      tip.hidden = false;
      const stage = svgBox.getBoundingClientRect();
      const flip = px > width * 0.58;
      tip.style.left = flip ? "auto" : `${Math.min(px + 12, stage.width - 8)}px`;
      tip.style.right = flip ? `${Math.max(8, width - px + 12)}px` : "auto";
      tip.style.top = `${m.t + 4}px`;
    }
    function hide() { guide.setAttribute("visibility", "hidden"); tip.hidden = true; cursor = -1; }
    const indexAt = (clientX: number) => {
      const rect = svg.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * width;
      if (linear) {
        const target = xMin + ((px - m.l) / iw) * (xMax - xMin);
        let best = 0, bd = Infinity;
        spec.xValues!.forEach((v, i) => { const d = Math.abs(v - target); if (d < bd) { bd = d; best = i; } });
        return best;
      }
      return Math.max(0, Math.min(n - 1, Math.floor(((px - m.l) / iw) * n)));
    };
    overlay.addEventListener("pointermove", (e) => show(indexAt((e as PointerEvent).clientX)));
    overlay.addEventListener("pointerleave", hide);
    overlay.addEventListener("blur", hide);
    overlay.addEventListener("keydown", (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === "ArrowRight") { show(Math.min(n - 1, (cursor < 0 ? -1 : cursor) + 1)); e.preventDefault(); }
      if (k === "ArrowLeft") { show(Math.max(0, (cursor < 0 ? 1 : cursor) - 1)); e.preventDefault(); }
      if (k === "Escape") hide();
    });
    svgBox.replaceChildren(svg);
  }

  function drawLegend() {
    legend.replaceChildren(...spec.series.map((s, i) => h("button", { type: "button", class: `legend-item${hidden.has(s.name) ? " off" : ""}`,
      "aria-pressed": String(!hidden.has(s.name)), title: `Toggle ${s.name}`,
      onClick: () => { if (hidden.has(s.name)) hidden.delete(s.name); else hidden.add(s.name); drawLegend(); draw(); } },
      h("i", { class: "swatch", style: `background:${colors[i]}` }), s.name)));
  }

  drawLegend();
  let last = 0;
  const ro = new ResizeObserver(() => {
    const w = svgBox.clientWidth;
    if (w && Math.abs(w - last) > 2) { last = w; draw(); }
  });
  queueMicrotask(() => { ro.observe(svgBox); if (!last) draw(); });
  return root;
}

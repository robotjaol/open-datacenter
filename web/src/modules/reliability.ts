import type { Ctx } from "../main";
import { chart } from "../charts";
import { activeData } from "../state";
import type { ModuleView } from "../types";
import { chip, fixed, group, h, note, panel, svgEl, table } from "../util";

function interval(rel: any): HTMLElement {
  const lo = 0.9984, hi = 0.9992, w = 640, pad = 24;
  const x = (v: number) => pad + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (w - 2 * pad);
  const svg = svgEl("svg", { viewBox: `0 0 ${w} 120`, class: "interval", role: "img", "aria-label": "Availability estimate with 95 percent Wilson interval" });
  svg.append(svgEl("line", { x1: pad, x2: w - pad, y1: 60, y2: 60, stroke: "rgba(255,255,255,0.2)" }));
  for (let t = lo; t <= hi + 1e-9; t += 0.0002) {
    svg.append(svgEl("line", { x1: x(t), x2: x(t), y1: 56, y2: 64, stroke: "rgba(255,255,255,0.35)" }));
    svg.append(svgEl("text", { x: x(t), y: 88, "text-anchor": "middle", fill: "#9aa6b3", "font-size": 12 }, `${(t * 100).toFixed(2)}%`));
  }
  svg.append(svgEl("rect", { x: x(rel.wilson_95_low), y: 50, width: x(rel.wilson_95_high) - x(rel.wilson_95_low), height: 20, fill: "rgba(56,189,248,0.3)", stroke: "#38bdf8" }));
  svg.append(svgEl("circle", { cx: x(rel.sample_availability), cy: 60, r: 5, fill: "#f2b84b" }));
  svg.append(svgEl("path", { d: `M${x(rel.exact_availability)},44 l6,-12 h-12 z`, fill: "#e8edf2" }));
  svg.append(svgEl("text", { x: x(rel.exact_availability), y: 26, "text-anchor": "middle", fill: "#e8edf2", "font-size": 12 }, "Exact"));
  svg.append(svgEl("text", { x: pad, y: 114, fill: "#9aa6b3", "font-size": 12 }, "Axis: availability, %. Amber dot = Monte Carlo sample, blue band = 95% Wilson interval."));
  return h("div", { class: "diagram" }, svg);
}

export function reliability(ctx: Ctx): ModuleView {
  const data = activeData(ctx.store);
  const { core, twin } = data;
  const rel = core.reliability, c = core.config;
  const checks = core.derived.n_plus_one_checks as any[];
  const names: Record<string, string> = { ups_per_path_kw: "UPS per path", transformers_per_path_kva: "Transformers per path", generators_per_path_kw: "Generators per path", chillers_shared_kwth: "Chillers (shared)", cdus_per_hall_kwth: "CDUs per hall" };
  const units: Record<string, string> = { ups_per_path_kw: "kW", transformers_per_path_kva: "kVA", generators_per_path_kw: "kW", chillers_shared_kwth: "kWth", cdus_per_hall_kwth: "kWth" };
  const counts = new Map<string, number>();
  twin.equipment.forEach((e) => counts.set(`${e.system} ${e.path}`, (counts.get(`${e.system} ${e.path}`) ?? 0) + 1));
  const loadSorted = [...data.hourly.columns.it_kw].sort((a, b) => b - a).filter((_, i) => i % 24 === 0);
  const tables = ctx.store.tables;
  const unavailability = 1 - rel.exact_availability;
  const el = h("div", { class: "stack" },
    h("div", { class: "page-head" }, h("p", { class: "pattern" }, "Dashboard"), h("h1", {}, "Reliability and Capacity"),
      h("p", {}, "A simple steady-state availability screen, redundancy checks and the failure modes still open for engineering review.")),
    note("This does not establish a Tier classification, an SLA or a contractual availability. It has no repair times, outage durations or maintenance chronology.", "warn"),
    h("div", { class: "grid two" },
      panel("Availability estimate", [interval(rel), table(["Quantity", "Value"], [
        ["Exact availability", `${fixed(rel.exact_availability * 100, 4)}%`], ["Monte Carlo sample", `${fixed(rel.sample_availability * 100, 4)}% (${group(rel.samples)} samples, seed ${rel.seed})`],
        ["95% Wilson interval", `${fixed(rel.wilson_95_low * 100, 4)}% to ${fixed(rel.wilson_95_high * 100, 4)}%`],
        ["Path unavailability (each path)", fixed(c.path_unavailability, 4)], ["Both paths down together", fixed(c.path_unavailability ** 2, 6)], ["Common-cause unavailability", fixed(c.common_cause_unavailability, 4)],
        ["Equivalent steady-state unavailability", `${fixed(unavailability * 8760, 1)} h per 8,760 h (unit conversion only, not an outage prediction)`]], { num: [] })],
        { source: "report.json reliability. A = (1 - q_common) x (1 - q_path^2). Basis: " + rel.boundary }),
      panel("What the model does and does not simulate", [h("div", {}, h("h3", {}, "Included"), h("ul", {}, h("li", {}, "Two aggregate A/B paths, each unavailable with the same probability"), h("li", {}, "One independent common-cause event that takes both paths down"), h("li", {}, "Exact formula and a seeded Monte Carlo check of it")),
        h("h3", {}, "Not included"), h("ul", {}, h("li", {}, "Individual equipment failure rates and repair times"), h("li", {}, "Cooling, controls and utility failures as separate causes"), h("li", {}, "Maintenance windows, human error, fuel logistics"), h("li", {}, "Tier or uptime certification evidence")))],
        { source: "dcf/reliability.py; 13_reliability/README.md" })),
    h("div", { class: "grid two" },
      panel("N+1 capacity checks", [table(["Equipment", "Required", "After one loss", "Utilisation", "Result"], checks.map((k) => [names[k.key], `${group(k.required, 0)} ${units[k.key]}`,
        `${group(k.remaining_capacity_after_one_loss, 0)} ${units[k.key]}`, `${fixed(k.utilisation_after_loss * 100, 1)}%`, chip(k.passes ? "ok" : "bad", k.passes ? "Pass" : "Fail")]), { num: [1, 2, 3] })],
        { source: "core.json derived.n_plus_one_checks (computed by dcf in Python)" }),
      panel("Equipment redundancy", [table(["System", "Path or hall", "Installed assets"], [...counts.entries()].map(([k, n]) => [k.split(" ")[0], k.split(" ")[1], n]), { num: [2] })], { source: "equipment-schedule.csv" })),
    h("div", { class: "grid two" },
      panel("Capacity utilisation: occupancy ramp", [chart({ title: "Occupancy fraction by operating year", labels: c.occupancy.map((_: number, i: number) => `Y${i + 1}`), xLabel: "Operating year", yLabel: "Occupancy", unit: "%", decimals: 0, height: 240, tickEvery: 1, yMin: 0, yMax: 100,
        series: [{ name: "Occupancy", values: c.occupancy.map((v: number) => v * 100), kind: "bar" }], source: "configs/tropical-5mw.json occupancy (financial assumption)" })]),
      panel("Capacity utilisation: IT load duration", [chart({ title: "Hourly IT load, sorted high to low, as a share of design IT", xValues: loadSorted.map((_, i) => (i / (loadSorted.length - 1)) * 100), xLabel: "Share of year (%)", yLabel: "IT load", unit: "% of design", decimals: 1, height: 240,
        series: [{ name: "IT load", values: loadSorted.map((v) => (v / c.it_kw) * 100) }], source: "hourly-energy.csv sampled daily (simulated, synthetic profile)" })])),
    panel("Failure modes and effects (FMEA summary)", [table(["ID", "Failure", "Effect", "Mitigation to review", "Owner", "Status"], tables.fmea.map((r) => [r.id, r.failure, r.effect, r.mitigation_to_review, r.owner, r.status]), { cls: "wraps" })], { source: "13_reliability/fmea.csv" }),
    panel("Maintenance and isolation intent", [table(["Item", "Isolation intent", "Surviving capacity", "Unresolved dependency", "Status"], tables.maintenance_matrix.map((r) => [r.item, r.isolation_intent, r.surviving_capacity, r.unresolved_dependency, r.status]), { cls: "wraps" })], { source: "13_reliability/maintenance-matrix.csv" }),
    panel("Offline supervisory cases", [table(["Case", "Expected source", "Observed source", "Alarms", "Result"], core.commissioning.map((r: any) => [r.id, r.expected_source, r.actual.observed_source, r.actual.alarms.join(", ") || "none", chip(r.passed ? "ok" : "bad", r.passed ? "Pass" : "Fail")]))],
      { source: "commissioning-results.json. Offline software scenarios, not physical integrated systems tests." }));
  return { el };
}

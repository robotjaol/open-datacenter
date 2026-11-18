import type { Ctx } from "../main";
import { chart } from "../charts";
import { loadParameters, runScenario } from "../state";
import type { ModuleView, RunResult } from "../types";
import { download, fixed, group, h, note, panel, percent, table, toCsv } from "../util";

interface Param { key: string; label: string; unit: string; group: string; min: number; max: number; step: number; kind: string; baseline: number }

const PRESETS: { name: string; values: Record<string, number> }[] = [
  { name: "Hotter climate (+3 degC)", values: { weather_mean_c: 32, design_ambient_c: 38 } },
  { name: "Solar 5 MWp", values: { pv_kwp: 5000 } },
  { name: "High tariff", values: { electricity_usd_per_kwh: 0.2 } },
  { name: "Dense racks 35 kW", values: { rack_kw: 35 } },
  { name: "Capacity price -10%", values: { capacity_usd_kw_month: 162 } },
];

let cachedParams: Param[] | null = null;
let values: Record<string, number> = {};
let status: { kind: "idle" | "running" | "error" | "done"; text: string } = { kind: "idle", text: "Reference scenario loaded. Adjust parameters, then run the Python model." };

const money = (id: string, v: number | null) => v === null ? "n/a" : id.endsWith("usd") || id === "annual_opex_usd" || id === "capex_usd" ? `${fixed(v / 1e6, 2)} M` : id.endsWith("kwh") ? `${fixed(v / 1e6, 2)} G` : id === "availability" || id === "irr" ? percent(v, 3) : fixed(v, v > 100 ? 0 : 3);

export function scenarioModule(ctx: Ctx): ModuleView {
  const store = ctx.store;
  const host = h("div", { class: "stack" });
  const body = h("div", { class: "stack" });

  async function init() {
    if (!store.apiOnline) { draw(); return; }
    if (!cachedParams) {
      try { cachedParams = (await loadParameters()).parameters as Param[]; } catch (e) { status = { kind: "error", text: String(e) }; }
    }
    draw();
  }

  async function execute() {
    const params = cachedParams ?? [];
    const overrides: Record<string, number> = {};
    for (const p of params) if (values[p.key] !== undefined && values[p.key] !== p.baseline) overrides[p.key] = values[p.key];
    status = { kind: "running", text: "Running the Python model. This takes a few seconds." };
    draw();
    try {
      const result = await runScenario(overrides);
      store.run = result;
      store.scenario = { ...result.payload, label: "Scenario run", kind: "scenario" };
      status = { kind: "done", text: `Executed by ${result.execution.engine} ${result.execution.model_version} in ${result.execution.seconds} s. Config digest ${result.execution.config_sha256.slice(0, 12)}.` };
    } catch (e) {
      status = { kind: "error", text: `Run failed: ${(e as Error).message}` };
    }
    draw();
  }

  function reset() { values = {}; store.run = null; store.scenario = null; store.active = "reference"; status = { kind: "idle", text: "Reset to the reference scenario." }; draw(); }

  function paramField(p: Param): HTMLElement {
    const v = values[p.key] ?? p.baseline;
    const changed = v !== p.baseline;
    const number = h("input", { type: "number", id: `n-${p.key}`, min: p.min, max: p.max, step: p.step, value: v, "aria-label": `${p.label} (${p.unit})` });
    const range = h("input", { type: "range", min: p.min, max: p.max, step: p.step, value: v, "aria-label": `${p.label} slider` });
    const set = (x: number) => { values[p.key] = x; (number as HTMLInputElement).value = String(x); (range as HTMLInputElement).value = String(x); wrap.classList.toggle("changed", x !== p.baseline); };
    number.addEventListener("input", () => { const x = Number((number as HTMLInputElement).value); if (Number.isFinite(x)) set(x); });
    range.addEventListener("input", () => set(Number((range as HTMLInputElement).value)));
    const wrap = h("div", { class: `param${changed ? " changed" : ""}` }, h("label", { for: `n-${p.key}` }, p.label), number, range,
      h("span", { class: "meta" }, `${p.unit}. Reference ${group(p.baseline, p.baseline % 1 ? 3 : 0)}. Range ${group(p.min, p.min % 1 ? 3 : 0)} to ${group(p.max, 0)}.${p.kind === "derived" ? " Scales the occupancy ramp." : ""}`));
    return wrap;
  }

  function results(run: RunResult): HTMLElement {
    const ref = store.reference.core, scn = run.payload.core;
    const months = ref.energy.monthly.map((m: any) => `M${m.month}`);
    const refCum = [-ref.finance.capex_usd, ...ref.finance.years.map((y: any) => y.cumulative_cashflow_usd)];
    const scnCum = [-scn.finance.capex_usd, ...scn.finance.years.map((y: any) => y.cumulative_cashflow_usd)];
    const exportJson = () => download("scenario-run.json", JSON.stringify({ execution: run.execution, changes: run.changes, comparison: run.comparison }, null, 2), "application/json");
    const exportCsv = () => download("scenario-comparison.csv", toCsv(run.comparison.map((r) => ({ indicator: r.label, unit: r.unit, baseline: r.baseline, scenario: r.scenario, delta: r.delta, delta_pct: r.delta_pct }))), "text/csv");
    return h("div", { class: "stack" },
      panel("Parameter changes", [run.changes.length ? table(["Parameter", "Unit", "Reference", "Scenario"], run.changes.map((c) => [c.label, c.unit, group(c.baseline, 3), group(c.scenario, 3)]), { num: [2, 3] }) : h("p", { class: "empty" }, "No parameters changed. The run reproduces the reference scenario.")],
        { source: `Live run, ${run.execution.engine}, config digest ${run.execution.config_sha256.slice(0, 16)}.`, actions: [h("button", { class: "btn", type: "button", onClick: exportJson }, "Export JSON"), h("button", { class: "btn", type: "button", onClick: exportCsv }, "Export CSV")] }),
      panel("Baseline versus scenario", [table(["Indicator", "Unit", "Baseline", "Scenario", "Change", "Change %"], run.comparison.map((r) => [r.label, r.unit, money(r.id, r.baseline), money(r.id, r.scenario),
        r.delta === null ? "n/a" : h("span", { class: r.delta === 0 ? "" : r.delta > 0 ? "pos" : "neg" }, `${r.delta > 0 ? "+" : ""}${money(r.id, r.delta)}`), r.delta_pct === null ? "n/a" : percent(r.delta_pct, 1)]), { num: [2, 3, 4, 5] })],
        { source: "Both columns come from the Python model. Colour shows direction of change, not good or bad." }),
      h("div", { class: "grid two" },
        panel("Monthly facility energy", [chart({ title: "Baseline versus scenario", labels: months, xLabel: "Month", yLabel: "Energy", unit: "MWh", decimals: 0, height: 260, tickEvery: 1,
          series: [{ name: "Baseline", values: ref.energy.monthly.map((m: any) => m.facility_kwh / 1000), kind: "bar", color: "#7c9cff" }, { name: "Scenario", values: scn.energy.monthly.map((m: any) => m.facility_kwh / 1000), kind: "bar" }], source: "Live Python run vs reference artifacts (simulated, synthetic profile)" })]),
        panel("Cumulative cash flow", [chart({ title: "Baseline versus scenario", labels: ["Y0", ...ref.finance.years.map((y: any) => `Y${y.year}`)], xLabel: "Year", yLabel: "Cumulative", unit: "USD M", decimals: 2, height: 260, tickEvery: 1,
          series: [{ name: "Baseline", values: refCum.map((v: number) => v / 1e6), color: "#7c9cff", dashed: true }, { name: "Scenario", values: scnCum.map((v: number) => v / 1e6), color: "#f2b84b" }], source: "Live Python run vs cashflows.csv" })])),
      h("div", { class: "panel-actions" },
        h("button", { class: "btn primary", type: "button", onClick: () => { store.active = "scenario"; ctx.render(); } }, "Show scenario in all modules"),
        h("span", { class: "unit" }, "The twin, charts and tables will use this run until you return to the reference.")));
  }

  function draw() {
    const params = cachedParams ?? [];
    if (!store.apiOnline) {
      body.replaceChildren(h("div", { class: "error", role: "alert" }, "The Python engine is not reachable, so scenarios cannot run. Static data still works."),
        panel("Start the engine", [h("p", {}, "From the repository root run:"), h("pre", { class: "md", style: "padding:12px" }, h("code", {}, "python -m dcf.cli web-data\npython -m dcf.cli serve")),
          h("p", { class: "unit" }, "Then reload this page. Scenario results are never approximated in the browser.")]));
      host.replaceChildren(head(), body);
      return;
    }
    const groups = [...new Set(params.map((p) => p.group))];
    const running = status.kind === "running";
    const statusEl = h("div", { class: "status", role: "status", "aria-live": "polite" },
      running ? h("i", { class: "spinner" }) : null,
      status.kind === "error" ? h("span", { class: "error" }, status.text) : h("span", {}, status.text));
    body.replaceChildren(
      note("Inputs are validated by the Python model, which rejects out-of-range or inconsistent values. The reference configuration file is never modified; each run uses a temporary in-memory copy.", "info"),
      panel("Scenario inputs", [
        h("div", { class: "panel-actions" }, h("span", { class: "unit" }, "Presets run the live model:"), ...PRESETS.map((pr) => h("button", { class: "btn", type: "button", disabled: running ? "" : undefined,
          onClick: () => { values = { ...values, ...pr.values }; draw(); } }, pr.name))),
        ...groups.map((g) => h("div", { class: "stack", style: "gap:12px" }, h("h3", {}, g), h("div", { class: "params" }, ...params.filter((p) => p.group === g).map(paramField)))),
        h("div", { class: "panel-actions" }, h("button", { class: "btn primary", type: "button", disabled: running ? "" : undefined, onClick: execute }, running ? "Running" : "Run Python model"),
          h("button", { class: "btn", type: "button", disabled: running ? "" : undefined, onClick: reset }, "Reset to reference"), statusEl)],
        { source: "dcf/scenario.py parameter table. Only parameters the model supports and validates are exposed." }),
      store.run ? results(store.run) : h("p", { class: "empty" }, "No run yet. Results appear here with a baseline comparison and export options."));
    host.replaceChildren(head(), body);
  }
  function head() {
    return h("div", { class: "page-head" }, h("p", { class: "pattern" }, "Form"), h("h1", {}, "Scenario Explorer"),
      h("p", {}, "Change supported inputs and execute the actual Python model. Nothing here is a client-side approximation."));
  }
  init();
  return { el: host };
}

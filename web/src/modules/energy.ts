import type { Ctx } from "../main";
import { chart, type Series } from "../charts";
import { activeData } from "../state";
import type { Dataset, ModuleView } from "../types";
import { fixed, group, h, note, panel, table } from "../util";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
type Grain = "hour" | "day" | "month" | "year";

function hourIndex(month: number, day: number): number {
  let d = 0;
  for (let i = 0; i < month - 1; i++) d += DAYS[i];
  return (d + day - 1) * 24;
}

export function energy(ctx: Ctx): ModuleView {
  const store = ctx.store;
  const data = activeData(store);
  const other: Dataset | null = store.active === "scenario" ? store.reference : null;
  const state = { grain: "month" as Grain, month: 7, day: 15, overlay: true };
  const host = h("div", { class: "stack" });
  const cols = data.hourly.columns;

  function mainChart(): HTMLElement {
    if (state.grain === "hour") {
      const start = hourIndex(state.month, state.day);
      const slice = (name: string) => cols[name].slice(start, start + 24);
      return chart({ title: `Hourly power on ${MONTHS[state.month - 1]} ${state.day}`, labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`),
        xLabel: "Hour of day (synthetic 2025, local)", yLabel: "Power", unit: "kW", decimals: 0, height: 300, tickEvery: 3,
        series: [{ name: "Facility", values: slice("facility_kw") }, { name: "IT", values: slice("it_kw"), color: "#7c9cff" },
          { name: "Grid import", values: slice("grid_kw"), color: "#f2b84b", dashed: true }, { name: "PV used", values: slice("pv_used_kw"), color: "#6fcf97" }],
        source: "hourly-energy.csv (simulated, synthetic profile)" });
    }
    if (state.grain === "day") {
      const first = hourIndex(state.month, 1);
      const n = DAYS[state.month - 1];
      const daily = (name: string) => Array.from({ length: n }, (_, d) => cols[name].slice(first + d * 24, first + d * 24 + 24).reduce((a, b) => a + b, 0) / 1000);
      return chart({ title: `Daily energy in ${MONTHS[state.month - 1]}`, labels: Array.from({ length: n }, (_, i) => String(i + 1)), xLabel: "Day of month", yLabel: "Energy", unit: "MWh", decimals: 1, height: 300, tickEvery: 2,
        series: [{ name: "Facility", values: daily("facility_kw"), kind: "line" }, { name: "IT", values: daily("it_kw"), kind: "line", color: "#7c9cff" }, { name: "Grid import", values: daily("grid_kw"), kind: "line", color: "#f2b84b", dashed: true }],
        source: "hourly-energy.csv summed per day (simulated, synthetic profile)" });
    }
    if (state.grain === "month") {
      const m = data.core.energy.monthly;
      const series: Series[] = [{ name: "Facility", values: m.map((x: any) => x.facility_kwh / 1000), kind: "bar" }, { name: "IT", values: m.map((x: any) => x.it_kwh / 1000), kind: "bar", color: "#7c9cff" },
        { name: "Grid import", values: m.map((x: any) => x.grid_kwh / 1000), kind: "line", color: "#f2b84b" }];
      if (other && state.overlay) series.push({ name: "Reference facility", values: other.core.energy.monthly.map((x: any) => x.facility_kwh / 1000), kind: "line", color: "#e8829f", dashed: true });
      return chart({ title: "Monthly energy", labels: MONTHS, xLabel: "Month (synthetic 2025)", yLabel: "Energy", unit: "MWh", decimals: 0, height: 300, tickEvery: 1, series,
        source: "monthly-energy.csv (simulated, synthetic profile)" });
    }
    const b = data.core.derived.annual_energy_balance_kwh as Record<string, number>;
    const names: Record<string, string> = { it: "IT", compressors: "Compressors", ups_loss: "UPS loss", fans: "Fans", transformer_loss: "Transformer loss", pumps: "Pumps", distribution_loss: "Distribution loss", other_facility: "Other facility" };
    const keys = Object.keys(names);
    return chart({ title: "Annual energy balance of the facility", labels: keys.map((k) => names[k]), xLabel: "", yLabel: "Energy", unit: "GWh", decimals: 2, height: 300, tickEvery: 1,
      series: [{ name: "Annual energy", values: keys.map((k) => b[k] / 1e6), kind: "bar" }], source: "Sum of hourly-energy.csv columns; closes to annual facility energy (simulated, synthetic profile)" });
  }

  function draw() {
    const e = data.core.energy, m = e.monthly;
    const seg = h("div", { class: "seg", role: "group", "aria-label": "Time resolution" }, ...(["hour", "day", "month", "year"] as Grain[]).map((g) =>
      h("button", { type: "button", "aria-pressed": String(state.grain === g), onClick: () => { state.grain = g; draw(); } }, g[0].toUpperCase() + g.slice(1))));
    const scenarioNote = other ? h("label", { class: "check" }, h("input", { type: "checkbox", checked: state.overlay ? "" : undefined, onChange: (ev: Event) => { state.overlay = (ev.target as HTMLInputElement).checked; draw(); } }), "Overlay reference (monthly view)") : null;
    const pvTotal = e.pv_used_kwh + e.pv_curtailed_kwh;
    host.replaceChildren(
      h("div", { class: "page-head" }, h("p", { class: "pattern" }, "Analytics"), h("h1", {}, "Energy and Sustainability"),
        h("p", {}, "Hourly power balance, monthly summaries, PUE, direct water and operational grid carbon from the 8,760-hour model.")),
      note("The profile is a synthetic non-leap 2025 year built from sine curves for weather and load. It is not measured weather and not actual facility consumption.", "warn"),
      panel("Energy profile", [h("div", { class: "panel-actions" }, seg, grainControls(), scenarioNote), mainChart()], { source: "Python model output; see chart footnote." }),
      h("div", { class: "grid two" },
        panel("PUE trend", [chart({ title: "Energy-weighted PUE by month", labels: MONTHS, xLabel: "Month", yLabel: "PUE", unit: "ratio", decimals: 3, height: 240, tickEvery: 1, yMin: 1.2, yMax: 1.5,
          series: [{ name: "Monthly PUE", values: m.map((x: any) => x.pue), kind: "line" }, ...(other && state.overlay ? [{ name: "Reference", values: other.core.energy.monthly.map((x: any) => x.pue), kind: "line" as const, color: "#e8829f", dashed: true }] : [])],
          source: `monthly-energy.csv. Annual PUE ${fixed(e.pue, 3)} = facility kWh / IT kWh. PV never changes PUE.` })]),
        panel("Operational grid carbon", [chart({ title: "Grid emissions by month", labels: MONTHS, xLabel: "Month", yLabel: "Emissions", unit: "tCO2e", decimals: 0, height: 240, tickEvery: 1,
          series: [{ name: "Grid tCO2e", values: data.core.derived.monthly_grid_tco2e, kind: "bar" }],
          source: `core.json derived.monthly_grid_tco2e = grid kWh x ${data.core.config.grid_kgco2e_per_kwh} kgCO2e/kWh. Operational scope only; no embodied carbon, refrigerant or diesel.` })])),
      h("div", { class: "grid two" },
        panel("Annual summary", [table(["Quantity", "Value", "Unit"], [
          ["IT energy", fixed(e.it_kwh / 1e6, 2), "GWh"], ["Facility energy", fixed(e.facility_kwh / 1e6, 2), "GWh"], ["Grid import", fixed(e.grid_kwh / 1e6, 2), "GWh"],
          ["PV energy used on site", fixed(e.pv_used_kwh / 1e6, 2), "GWh"], ["PV curtailed", fixed(e.pv_curtailed_kwh / 1e6, 2), "GWh"], ["PUE", fixed(e.pue, 3), "ratio"],
          ["Direct WUE", fixed(e.direct_wue_l_kwh, 3), "L/kWh IT"], ["Direct site water", group(e.direct_site_water_m3, 0), "m3/yr"], ["Operational grid carbon", group(e.operational_grid_tco2e, 0), "tCO2e/yr"],
          ["Grid electricity cost", fixed(e.electricity_usd / 1e6, 2), "USD M/yr"]], { num: [1] })], { source: "report.json energy (simulated, synthetic profile). Electricity cost includes demand charges." }),
        panel("Solar PV", [pvTotal > 0 ? chart({ title: "PV energy used on site by month", labels: MONTHS, xLabel: "Month", yLabel: "Energy", unit: "MWh", decimals: 0, height: 240, tickEvery: 1,
          series: [{ name: "PV used", values: MONTHS.map((_, mi) => sumMonth("pv_used_kw", mi + 1) / 1000), kind: "bar", color: "#6fcf97" }, { name: "PV curtailed", values: MONTHS.map((_, mi) => sumMonth("pv_curtailed_kw", mi + 1) / 1000), kind: "bar", color: "#94a3b8" }],
          stacked: true, source: "hourly-energy.csv (simulated, synthetic profile)" }) : h("p", { class: "empty" }, "This scenario has 0 kWp of PV, so there is no PV potential to show. Open the Scenario Explorer and set PV capacity to see the effect on grid energy and carbon.")],
          { source: `configs/tropical-5mw.json pv_kwp = ${group(data.core.config.pv_kwp)} kWp` })));
  }
  function grainControls(): HTMLElement {
    if (state.grain === "hour") return h("div", { class: "panel-actions" }, monthSelWrap(), h("div", { class: "field" }, h("label", {}, "Day"), dayInput()));
    if (state.grain === "day") return h("div", { class: "panel-actions" }, monthSelWrap());
    return h("span", {});
  }
  function monthSelWrap() { return h("div", { class: "field" }, h("label", {}, "Month"), h("select", { "aria-label": "Month", onChange: (ev: Event) => { state.month = Number((ev.target as HTMLSelectElement).value); state.day = Math.min(state.day, DAYS[state.month - 1]); draw(); } }, ...MONTHS.map((x, i) => h("option", { value: i + 1, selected: i + 1 === state.month }, x)))); }
  function dayInput() { return h("input", { type: "number", min: 1, max: DAYS[state.month - 1], value: state.day, "aria-label": "Day of month", style: "width:88px", onChange: (ev: Event) => { state.day = Math.max(1, Math.min(DAYS[state.month - 1], Number((ev.target as HTMLInputElement).value) || 1)); draw(); } }); }
  function sumMonth(name: string, month: number): number {
    return cols[name].reduce((acc, v, i) => acc + (cols.month[i] === month ? v : 0), 0);
  }
  draw();
  return { el: host };
}

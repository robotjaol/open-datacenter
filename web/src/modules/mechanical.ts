import type { Ctx } from "../main";
import { box, label, line } from "../diagram";
import { chart } from "../charts";
import { activeData } from "../state";
import type { ModuleView } from "../types";
import { fixed, group, h, note, panel, svgEl, table } from "../util";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function mechanical(ctx: Ctx): ModuleView {
  const data = activeData(ctx.store);
  const { core, hourly, twin } = data;
  const sz = core.sizing, c = core.config, bal = sz.design_balance;
  const chl = sz.chillers_shared_kwth, cdu = sz.cdus_per_hall_kwth;
  const svg = svgEl("svg", { viewBox: "0 0 980 400", role: "img", "aria-label": "Conceptual cooling flow diagram" }) as SVGElement;
  box(svg, { x: 16, y: 40, w: 170, h: 92, lines: ["Air-cooled IT heat", `${group(sz.air_it_kwth)} kWth`, `${fixed(sz.air_volume_flow_m3_s, 0)} m3/s airflow`, `${c.air_delta_t_k} K air delta-T`], dim: [false, true, true, true] });
  box(svg, { x: 16, y: 220, w: 170, h: 92, lines: ["Liquid-cooled IT heat", `${group(sz.liquid_it_kwth)} kWth`, `${fixed(sz.liquid_mass_flow_kg_s, 1)} kg/s water`, `${c.water_delta_t_k} K water delta-T`], dim: [false, true, true, true] });
  box(svg, { x: 262, y: 40, w: 200, h: 92, lines: ["Air-side cooling units", "Not sized or placed", `Fan allowance ${fixed(bal.fan_kw, 0)} kW`, "Bulk airflow screening only"], dim: [false, true, true, true] });
  box(svg, { x: 262, y: 220, w: 200, h: 92, lines: [`CDUs: ${twin.halls.length} halls x ${cdu.installed_units}`, `${group(cdu.unit_rating)} kWth each, duty ${cdu.duty_units} + 1`, `Required ${fixed(cdu.required, 0)} kWth per hall`, "TCS loop not modeled"], dim: [false, true, true, true] });
  box(svg, { x: 540, y: 130, w: 190, h: 92, lines: ["FWS chilled-water header", `${fixed(sz.chw_mass_flow_kg_s, 1)} kg/s total`, `${fixed(bal.cooling_kwth, 0)} kWth design load`, "Shared by all halls"], dim: [false, true, true, true] });
  box(svg, { x: 790, y: 130, w: 176, h: 92, lines: [`Chillers ${chl.installed_units} x ${group(chl.unit_rating)} kWth`, `Duty ${chl.duty_units} + 1 spare`, `COP ${fixed(bal.cop, 2)} at design`, `${fixed(bal.compressor_kw, 0)} kW compressors`], dim: [false, true, true, true] });
  box(svg, { x: 790, y: 290, w: 176, h: 70, lines: ["Heat rejection", `${group(core.derived.design_heat_rejection_kwth, 0)} kWth`, "Cooling load + compressor power"], dim: [false, false, true] });
  line(svg, [[186, 86], [262, 86]], "pipe-a"); line(svg, [[462, 86], [500, 86], [500, 160], [540, 160]], "pipe-w");
  line(svg, [[186, 266], [262, 266]], "pipe-w"); line(svg, [[462, 266], [500, 266], [500, 196], [540, 196]], "pipe-w");
  line(svg, [[730, 176], [790, 176]], "pipe-w"); line(svg, [[878, 222], [878, 290]], "pipe-h");
  label(svg, 16, 384, "Conceptual flow. Dashed = air, blue = water, amber = rejected heat. Pipe sizes, hydraulics, pump heads and psychrometrics are not modeled.");
  label(svg, 16, 368, "The heat balance is steady state. It is not a CFD result.");
  const bins = new Map<number, { cop: number; cool: number; n: number }>();
  hourly.columns.ambient_c.forEach((a, i) => {
    const key = Math.round(a * 2) / 2;
    const b = bins.get(key) ?? { cop: 0, cool: 0, n: 0 };
    b.cop += hourly.columns.cop[i]; b.cool += hourly.columns.cooling_kwth[i]; b.n++; bins.set(key, b);
  });
  const sorted = [...bins.entries()].sort((x, y) => x[0] - y[0]);
  const month = { value: 7 };
  const dayChart = h("div", {});
  function drawDay() {
    const cool = new Array(24).fill(0), comp = new Array(24).fill(0), cnt = new Array(24).fill(0);
    hourly.columns.month.forEach((m, i) => { if (m === month.value) { const hr = i % 24; cool[hr] += hourly.columns.cooling_kwth[i]; comp[hr] += hourly.columns.compressor_kw[i]; cnt[hr]++; } });
    dayChart.replaceChildren(chart({ title: `Average day in ${MONTHS[month.value - 1]}`, labels: cool.map((_, i) => `${String(i).padStart(2, "0")}:00`), xLabel: "Hour of day (local, synthetic)", yLabel: "Power", unit: "kW", decimals: 0, height: 260, tickEvery: 3,
      series: [{ name: "Cooling demand (kWth)", values: cool.map((v, i) => v / cnt[i]), kind: "line" }, { name: "Compressor power (kW)", values: comp.map((v, i) => v / cnt[i]), kind: "line", color: "#f2b84b" }],
      source: "hourly-energy.csv, mean of each hour across the month (simulated, synthetic profile)" }));
  }
  const select = h("select", { "aria-label": "Month", onChange: (e: Event) => { month.value = Number((e.target as HTMLSelectElement).value); drawDay(); } },
    ...MONTHS.map((m, i) => h("option", { value: i + 1, selected: i + 1 === month.value }, m)));
  const el = h("div", { class: "stack" },
    h("div", { class: "page-head" }, h("p", { class: "pattern" }, "Dashboard"), h("h1", {}, "Mechanical and Cooling"),
      h("p", {}, `Heat and flow screening for ${group(sz.air_it_kwth)} kWth of air-cooled and ${group(sz.liquid_it_kwth)} kWth of liquid-cooled IT load (${fixed(c.liquid_fraction * 100, 0)}% liquid).`)),
    note("This is a steady-state heat balance with closed-form flow estimates. It is not a validated CFD study, hydraulic model or psychrometric analysis.", "warn"),
    panel("Conceptual cooling flow", [h("div", { class: "diagram" }, svg)], { source: "report.json sizing and derived.design_heat_rejection_kwth. Conceptual, not for construction." }),
    h("div", { class: "grid two" },
      panel("Design thermal and flow indicators", [table(["Indicator", "Value", "Unit"], [
        ["Cooling demand at design", fixed(bal.cooling_kwth, 0), "kWth"], ["Chilled-water mass flow", fixed(sz.chw_mass_flow_kg_s, 1), "kg/s"],
        ["Liquid loop mass flow", fixed(sz.liquid_mass_flow_kg_s, 1), "kg/s"], ["Air volume flow", fixed(sz.air_volume_flow_m3_s, 1), "m3/s"],
        ["Chiller COP at design ambient", fixed(bal.cop, 2), "ratio"], ["Compressor power", fixed(bal.compressor_kw, 0), "kW"], ["Pump allowance", fixed(bal.pump_kw, 0), "kW"],
        ["Fan allowance", fixed(bal.fan_kw, 0), "kW"], ["Design ambient", fixed(c.design_ambient_c, 0), "degC"], ["Water delta-T", fixed(c.water_delta_t_k, 0), "K"], ["Air delta-T", fixed(c.air_delta_t_k, 0), "K"]], { num: [1] })],
        { source: "report.json sizing.design_balance; configs/tropical-5mw.json" }),
      panel("Chiller COP and cooling load versus ambient", [chart({ title: "Hourly means grouped by 0.5 degC ambient bins", xValues: sorted.map((s) => s[0]), xLabel: "Ambient temperature (degC)", yLabel: "Chiller COP", unit: "ratio", decimals: 2, height: 260,
        series: [{ name: "COP", values: sorted.map((s) => s[1].cop / s[1].n), kind: "line" }], source: "hourly-energy.csv (simulated, synthetic weather). COP is the model's linear derating curve." })])),
    panel("Daily cooling profile", [h("div", { class: "field", style: "max-width:200px" }, h("label", {}, "Month"), select), dayChart],
      { source: "hourly-energy.csv" }));
  drawDay();
  return { el };
}

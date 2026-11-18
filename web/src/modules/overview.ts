import type { Ctx } from "../main";
import { chart } from "../charts";
import { activeData } from "../state";
import type { Kpi, ModuleView } from "../types";
import { chip, formatKpi, group, h, info, note, panel, PROVENANCE_LABEL, usdM } from "../util";

const ORDER = ["Capacity", "Energy", "Efficiency", "Sustainability", "Finance", "Reliability"];

export function overview(ctx: Ctx): ModuleView {
  const data = activeData(ctx.store);
  const { core } = data;
  const rows: HTMLElement[] = [];
  for (const category of ORDER) {
    const items = core.kpis.filter((k: Kpi) => k.category === category);
    if (!items.length) continue;
    rows.push(h("tr", { class: "grouprow" }, h("td", { colspan: 4 }, category)));
    for (const k of items) {
      const shown = formatKpi(k);
      rows.push(h("tr", {}, h("th", { scope: "row", style: "text-align:left;font-weight:400;padding:8px 16px;border-bottom:1px solid var(--line)" }, k.label,
        " ", info(`${k.description} Source: ${k.sources.join(", ")}.`)),
        h("td", { class: "num val" }, shown.text), h("td", { class: "unit" }, shown.unit),
        h("td", {}, chip(k.provenance), k.synthetic ? h("span", { class: "sr-only" }, "Uses synthetic data") : null)));
    }
  }
  const balance = core.sizing.design_balance;
  const parts: [string, number][] = [["IT load", balance.it_kw], ["Compressors", balance.compressor_kw], ["UPS loss", balance.ups_loss_kw],
    ["Fans", balance.fan_kw], ["Transformer loss", balance.transformer_loss_kw], ["Pumps", balance.pump_kw],
    ["Distribution loss", balance.distribution_loss_kw], ["Other facility", balance.other_kw]];
  const months = core.energy.monthly;
  const years = core.finance.years;
  const el = h("div", { class: "stack" },
    h("div", { class: "page-head" }, h("p", { class: "pattern" }, "Dashboard"),
      h("h1", {}, "Executive Overview"),
      h("p", {}, `${core.provenance.scenario}. ${group(core.config.it_kw)} kW design IT in ${core.config.halls} halls. Design values are inputs; modeled and simulated values come from the Python model; financial values rest on illustrative assumptions.`)),
    note("Concept engineering only. This is not a certified design, a coordinated BIM model, a validated CFD study or a deployed operational digital twin. Energy results use a synthetic 8,760-hour profile, not measured weather or load.", "warn"),
    h("div", { class: "grid split-r" },
      panel("Indicators", [h("div", { class: "table-wrap" }, h("table", { class: "tbl" },
        h("caption", { class: "sr-only" }, "Facility indicators with provenance"),
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Indicator"), h("th", { scope: "col", class: "num" }, "Value"), h("th", { scope: "col" }, "Unit"), h("th", { scope: "col" }, "Provenance"))),
        h("tbody", {}, ...rows)))].map((n) => n), { source: `report.json and scenario.json (${core.provenance.origin}). Provenance classes: ${Object.values(PROVENANCE_LABEL).join("; ")}.`, cls: "kpi-panel" }),
      h("div", { class: "stack" },
        panel("Design power balance", [chart({ title: "Facility demand at full IT load and design ambient", labels: parts.map((p) => p[0]),
          xLabel: "", yLabel: "Power", unit: "kW", decimals: 0, height: 260, tickEvery: 1,
          series: [{ name: "Design power", values: parts.map((p) => p[1]), kind: "bar" }], source: "report.json sizing.design_balance (modeled, steady state)" })]),
        panel("Monthly energy and PUE", [chart({ title: "Facility and IT energy by month", labels: months.map((m: any) => `M${m.month}`),
          xLabel: "Month of synthetic 2025", yLabel: "Energy", unit: "MWh", decimals: 0, height: 240, tickEvery: 1,
          series: [{ name: "Facility energy", values: months.map((m: any) => m.facility_kwh / 1000), kind: "bar" },
            { name: "IT energy", values: months.map((m: any) => m.it_kwh / 1000), kind: "bar", color: "#7c9cff" }],
          source: "monthly-energy.csv (simulated, synthetic profile)" })]),
        panel("Fifteen-year cash flow", [chart({ title: "Net and cumulative cash flow, nominal USD", labels: years.map((y: any) => `Y${y.year}`),
          xLabel: "Operating year", yLabel: "Cash flow", unit: "USD M", decimals: 2, height: 240, tickEvery: 1,
          series: [{ name: "Net cash flow", values: years.map((y: any) => y.net_cashflow_usd / 1e6), kind: "bar" },
            { name: "Cumulative (after year-0 CAPEX)", values: years.map((y: any) => y.cumulative_cashflow_usd / 1e6), kind: "line", color: "#f2b84b" }],
          source: `cashflows.csv. Year-0 CAPEX ${usdM(core.finance.capex_usd)} USD is included in the cumulative line. Pre-tax, unlevered.` })]))));
  return { el };
}

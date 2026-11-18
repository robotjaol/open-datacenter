import type { Ctx } from "../main";
import { chart } from "../charts";
import { activeData } from "../state";
import type { ModuleView } from "../types";
import { chip, download, fixed, group, h, note, percent, panel, table, toCsv } from "../util";

const M = (v: number) => fixed(v / 1e6, 2);

export function finance(ctx: Ctx): ModuleView {
  const data = activeData(ctx.store);
  const { core } = data;
  const f = core.finance, c = core.config, years = f.years as any[];
  const labels = ["Y0", ...years.map((y) => `Y${y.year}`)];
  const net = [-f.capex_usd, ...years.map((y) => y.net_cashflow_usd)];
  const cum = [-f.capex_usd, ...years.map((y) => y.cumulative_cashflow_usd)];
  const sens = core.sensitivity as any[];
  const capexF = [...new Set(sens.map((s) => s.capex_factor))], priceF = [...new Set(sens.map((s) => s.capacity_price_factor))];
  const maxAbs = Math.max(...sens.map((s) => Math.abs(s.npv_usd)));
  const cell = (cf: number, pf: number) => {
    const s = sens.find((x) => x.capex_factor === cf && x.capacity_price_factor === pf)!;
    const a = Math.min(0.45, (Math.abs(s.npv_usd) / maxAbs) * 0.45);
    const base = cf === 1 && pf === 1;
    return h("td", { class: "num", style: `background:${s.npv_usd >= 0 ? `rgba(111,207,151,${a})` : `rgba(242,118,107,${a})`};${base ? "outline:2px solid var(--accent);outline-offset:-2px" : ""}` },
      `${M(s.npv_usd)} M`, h("br"), h("span", { class: "unit" }, `IRR ${s.irr === null ? "n/a" : percent(s.irr, 1)}`));
  };
  const contingency = c.base_capex_usd * c.contingency_fraction;
  const origin = data.kind === "scenario" ? "live model run" : "precomputed in artifacts/reference/sensitivity.csv";
  const el = h("div", { class: "stack" },
    h("div", { class: "page-head" }, h("p", { class: "pattern" }, "Dashboard"), h("h1", {}, "Financial Analysis"),
      h("p", {}, "Fifteen-year, nominal, pre-tax, unlevered cash flow with year-0 capital and year-end annual flows. Prices and revenues are illustrative.")),
    note(f.npv_usd < 0 ? `The reference case has a slightly negative NPV (${M(f.npv_usd)} M USD at ${percent(c.discount_rate, 0)}). Assumptions were not adjusted to improve it.` : "Illustrative assumptions. Not investment advice, a market study or a valuation.", "warn"),
    h("div", { class: "grid split-r" },
      panel("Cash flow", [chart({ title: "Net and cumulative cash flow", labels, xLabel: "Year (Y0 = initial CAPEX)", yLabel: "Cash flow", unit: "USD M", decimals: 2, height: 300, tickEvery: 1,
        series: [{ name: "Net cash flow", values: net.map((v) => v / 1e6), kind: "bar" }, { name: "Cumulative", values: cum.map((v) => v / 1e6), kind: "line", color: "#f2b84b" }],
        source: "cashflows.csv. Pre-tax, unlevered, nominal USD." })]),
      panel("Headline results", [table(["Indicator", "Value"], [
        ["Initial CAPEX", `${M(f.capex_usd)} M USD`], ["of which contingency", `${M(contingency)} M USD (${percent(c.contingency_fraction, 0)} of base)`], ["NPV", `${M(f.npv_usd)} M USD`],
        ["IRR", f.irr === null ? "not defined" : percent(f.irr, 2)], ["Simple payback", f.simple_payback_years === null ? "not reached" : `${fixed(f.simple_payback_years, 1)} years`],
        ["Gross lifecycle cost (NPV)", `${M(f.gross_lifecycle_cost_npv_usd)} M USD`], ["Discount rate", percent(c.discount_rate, 1)], ["Escalation", percent(c.escalation, 1)]], { num: [1] })],
        { source: "report.json finance; configs/tropical-5mw.json" })),
    panel("Annual components", [chart({ title: "Revenue and cost components by year", labels: years.map((y) => `Y${y.year}`), xLabel: "Operating year", yLabel: "Cash flow", unit: "USD M", decimals: 2, height: 320, tickEvery: 1, stacked: true,
      series: [{ name: "Capacity revenue", values: years.map((y) => y.capacity_revenue_usd / 1e6), kind: "bar" }, { name: "Energy recovery", values: years.map((y) => y.energy_recovery_usd / 1e6), kind: "bar", color: "#6fcf97" },
        { name: "Residual value", values: years.map((y) => y.residual_usd / 1e6), kind: "bar", color: "#b79cf0" },
        { name: "Electricity", values: years.map((y) => -y.electricity_usd / 1e6), kind: "bar", color: "#f2b84b" }, { name: "Fixed OPEX", values: years.map((y) => -y.fixed_opex_usd / 1e6), kind: "bar", color: "#e8829f" },
        { name: "Maintenance", values: years.map((y) => -y.maintenance_usd / 1e6), kind: "bar", color: "#94a3b8" }, { name: "Replacement", values: years.map((y) => -y.replacement_usd / 1e6), kind: "bar", color: "#f2896b" }],
      source: `cashflows.csv. Energy recovery is ${percent(c.energy_recovery_fraction, 0)} of electricity cost, so electricity is passed through to the customer.` })]),
    h("div", { class: "grid two" },
      panel("NPV sensitivity: CAPEX and capacity price", [h("div", { class: "table-wrap" }, h("table", { class: "tbl" },
        h("caption", { class: "sr-only" }, "NPV by CAPEX factor and capacity price factor"),
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "CAPEX factor \\ price factor"), ...priceF.map((p) => h("th", { scope: "col", class: "num" }, `${fixed(p, 1)}x price`)))),
        h("tbody", {}, ...capexF.map((cf) => h("tr", {}, h("th", { scope: "row", style: "text-align:left;font-weight:500;padding:8px 16px" }, `${fixed(cf, 1)}x CAPEX`), ...priceF.map((pf) => cell(cf, pf)))))))],
        { source: `${origin}. Green = positive NPV, red = negative. Outlined cell is the base case.` , actions: [chip(data.kind === "scenario" ? "simulated" : "design", data.kind === "scenario" ? "Live run" : "Precomputed")] }),
      panel("NPV by case", [chart({ title: "Nine sensitivity cases", labels: sens.map((s) => `${fixed(s.capex_factor, 1)} / ${fixed(s.capacity_price_factor, 1)}`), xLabel: "CAPEX factor / price factor", yLabel: "NPV", unit: "USD M", decimals: 2, height: 280, tickEvery: 1,
        series: [{ name: "NPV", values: sens.map((s) => s.npv_usd / 1e6), kind: "bar" }], source: origin })])),
    panel("Assumptions", [table(["Assumption", "Value", "Unit"], [
      ["Base CAPEX allowance", M(c.base_capex_usd), "USD M"], ["Contingency", percent(c.contingency_fraction, 0), "of base"], ["Capacity price", fixed(c.capacity_usd_kw_month, 0), "USD per kW-month"],
      ["Fixed OPEX", M(c.fixed_opex_usd_year), "USD M per year"], ["Maintenance", percent(c.maintenance_fraction, 1), "of base CAPEX per year"], ["Replacement", `${M(c.replacement_usd)} in year ${c.replacement_year}`, "USD M"],
      ["Residual value", percent(c.residual_fraction, 0), "of base CAPEX in final year"], ["Energy recovery from customer", percent(c.energy_recovery_fraction, 0), "of electricity cost"],
      ["Energy tariff", fixed(c.electricity_usd_per_kwh, 3), "USD per kWh"], ["Demand charge", fixed(c.demand_usd_per_kw_month, 1), "USD per kW-month"], ["Discount rate", percent(c.discount_rate, 1), "per year"], ["Escalation", percent(c.escalation, 1), "per year"]], { num: [1] })],
      { source: "configs/tropical-5mw.json. All values are illustrative author assumptions." }),
    panel("Cost allowances", [table(["ID", "Package", "USD", "Confidence", "Basis"], ctx.store.tables.cost_allowances.map((r) => [r.cost_id, r.package, group(Number(r.usd)), r.confidence, r.basis]), { num: [2], cls: "wraps" })],
      { source: "03_financial-model/cost-allowances.csv. These allowances sum to the base CAPEX." }),
    panel("Annual cash-flow table", [table(["Year", "Occupancy", "Capacity revenue", "Energy recovery", "Electricity", "Fixed OPEX", "Maintenance", "Replacement", "Residual", "Net", "Cumulative"],
      years.map((y) => [y.year, percent(y.occupancy, 0), M(y.capacity_revenue_usd), M(y.energy_recovery_usd), M(y.electricity_usd), M(y.fixed_opex_usd), M(y.maintenance_usd), M(y.replacement_usd), M(y.residual_usd), M(y.net_cashflow_usd), M(y.cumulative_cashflow_usd)]), { num: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })],
      { source: "cashflows.csv. Values in USD M, nominal.", actions: [h("button", { class: "btn", type: "button", onClick: () => download("cashflows.csv", toCsv(years), "text/csv") }, "Download CSV")] }));
  return { el };
}

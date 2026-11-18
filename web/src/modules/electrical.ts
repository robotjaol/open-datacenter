import type { Ctx } from "../main";
import { box, label, line } from "../diagram";
import { chart } from "../charts";
import { activeData } from "../state";
import type { Equipment, ModuleView } from "../types";
import { chip, fixed, group, h, note, panel, svgEl, table } from "../util";

const GROUPS: { key: string; system: string; name: string; unit: string }[] = [
  { key: "transformers_per_path_kva", system: "TX", name: "Transformers", unit: "kVA" },
  { key: "ups_per_path_kw", system: "UPS", name: "UPS modules", unit: "kW" },
  { key: "generators_per_path_kw", system: "GEN", name: "Generators", unit: "kW" },
];

export function electrical(ctx: Ctx): ModuleView {
  const data = activeData(ctx.store);
  const { core, twin } = data;
  const sz = core.sizing;
  let selected: string | null = null;
  const detail = h("div", {});
  const diagram = h("div", { class: "diagram" });

  function equipmentOf(system: string, path: string): Equipment[] {
    return twin.equipment.filter((e) => e.system === system && e.path === path);
  }

  function drawDetail() {
    if (!selected) { detail.replaceChildren(h("p", { class: "empty" }, "Select a block in the diagram to list its assets and capacity.")); return; }
    const [system, path] = selected.split(":");
    const items = equipmentOf(system, path);
    const g = GROUPS.find((x) => x.system === system);
    const info = g ? sz[g.key] : null;
    detail.replaceChildren(
      h("p", {}, h("b", {}, `${g?.name ?? system}, path ${path}`), info ? ` - ${info.installed_units} installed, ${info.duty_units} duty, 1 spare.` : ""),
      table(["Asset ID", "Nameplate", "Derating", "Status"], items.map((e) => [h("span", { class: "id" }, e.asset_id), `${group(e.nameplate)} ${e.unit}`, fixed(e.derating, 2), e.status]), { num: [1, 2] }));
  }

  function drawDiagram() {
    const svg = svgEl("svg", { viewBox: "0 0 980 440", role: "img", "aria-label": "Conceptual A/B power distribution single-line diagram" }) as SVGElement;
    const a = (key: string, system: string) => sz[key] && { u: sz[key], system };
    void a;
    const rowY: Record<string, number> = { A: 52, B: 252 };
    box(svg, { x: 16, y: 150, w: 150, h: 92, lines: ["Utility interface", "Normal feeders A and B", "Voltage and fault level", "not defined"], dim: [false, true, true, true] });
    for (const path of ["A", "B"]) {
      const y = rowY[path];
      const tx = sz.transformers_per_path_kva, ups = sz.ups_per_path_kw, gen = sz.generators_per_path_kw;
      line(svg, [[166, 196], [196, 196], [196, y + 44], [226, y + 44]], `wire ${path === "B" ? "b" : ""}`);
      const sel = (system: string) => selected === `${system}:${path}`;
      box(svg, { x: 226, y, w: 168, h: 96, lines: [`Path ${path} transformers`, `${tx.installed_units} x ${group(tx.unit_rating)} kVA`, `Duty ${tx.duty_units} + 1 spare`,
        `After 1 loss: ${group(tx.remaining_capacity_after_one_loss)} kVA`], dim: [false, true, true, true], selected: sel("TX"), onSelect: () => { selected = `TX:${path}`; drawDiagram(); drawDetail(); } });
      line(svg, [[394, y + 44], [424, y + 44]], `wire ${path === "B" ? "b" : ""}`);
      box(svg, { x: 424, y, w: 168, h: 96, lines: [`Path ${path} UPS`, `${ups.installed_units} x ${group(ups.unit_rating)} kW`, `Duty ${ups.duty_units} + 1 spare`,
        `Battery ${group(sz.battery_per_path_kwh, 0)} kWh`], dim: [false, true, true, true], selected: sel("UPS"), onSelect: () => { selected = `UPS:${path}`; drawDiagram(); drawDetail(); } });
      line(svg, [[592, y + 44], [622, y + 44]], `wire ${path === "B" ? "b" : ""}`);
      box(svg, { x: 622, y, w: 120, h: 96, lines: [`LV-${path} bus`, "Rating, fault duty", "and protection", "not defined"], dim: [false, true, true, true] });
      line(svg, [[742, y + 44], [790, y + 44], [790, 196], [818, 196]], `wire ${path === "B" ? "b" : ""}`);
      // generator above or below
      const gy = path === "A" ? y - 40 : y + 112;
      const gSel = sel("GEN");
      box(svg, { x: 226, y: gy, w: 168, h: 34, lines: [`Path ${path} generators ${gen.installed_units} x ${group(gen.unit_rating)} kW`], selected: gSel, onSelect: () => { selected = `GEN:${path}`; drawDiagram(); drawDetail(); } });
      line(svg, [[310, path === "A" ? gy + 34 : gy], [310, path === "A" ? y : y + 96]], `wire ${path === "B" ? "b" : ""}`);
    }
    box(svg, { x: 818, y: 150, w: 150, h: 92, lines: ["Critical IT load", `${group(core.config.it_kw)} kW design`, `${twin.racks.length} racks, A/B fed`, "Dual-corded assumed"], dim: [false, true, true, true] });
    label(svg, 16, 424, "Conceptual single-line. Not a coordinated drawing. Breaker ratings, fault current, protection coordination and arc-flash are not calculated.", "start");
    label(svg, 16, 408, "Generators feed the path through a switchgear interface that is not sized here.", "start");
    diagram.replaceChildren(svg);
  }

  const checks = core.derived.n_plus_one_checks as any[];
  const names: Record<string, string> = { ups_per_path_kw: "UPS per path", transformers_per_path_kva: "Transformers per path", generators_per_path_kw: "Generators per path",
    chillers_shared_kwth: "Chillers (shared)", cdus_per_hall_kwth: "CDUs per hall" };
  const units: Record<string, string> = { ups_per_path_kw: "kW", transformers_per_path_kva: "kVA", generators_per_path_kw: "kW", chillers_shared_kwth: "kWth", cdus_per_hall_kwth: "kWth" };
  const elecChecks = checks.filter((c) => ["ups_per_path_kw", "transformers_per_path_kva", "generators_per_path_kw"].includes(c.key));
  const bal = sz.design_balance;
  const el = h("div", { class: "stack" },
    h("div", { class: "page-head" }, h("p", { class: "pattern" }, "Dashboard"), h("h1", {}, "Electrical Infrastructure"),
      h("p", {}, "Capacity screening of two independent A/B paths. Each path is sized for the full facility demand plus design margin with one local unit out of service.")),
    note("Conceptual diagram and capacity allowances only. No breaker ratings, short-circuit duty, protection coordination, earthing or arc-flash results exist in this model.", "warn"),
    panel("Conceptual A/B power distribution", [diagram, detail], { source: "report.json sizing; equipment-schedule.csv asset IDs. Conceptual, not for construction." }),
    h("div", { class: "grid two" },
      panel("N+1 capacity screening", [table(["Equipment", "Unit rating", "Required", "Duty units", "Installed", "After one loss", "Utilisation after loss", "N+1"],
        checks.map((c) => [names[c.key], `${group(c.unit_rating * (c.derating ?? 1), 0)} ${units[c.key]}`, `${group(c.required, 0)} ${units[c.key]}`, c.duty_units, c.installed_units,
          `${group(c.remaining_capacity_after_one_loss, 0)} ${units[c.key]}`, `${fixed(c.utilisation_after_loss * 100, 1)}%`, chip(c.passes ? "ok" : "bad", c.passes ? "Pass" : "Fail")]), { num: [1, 2, 3, 4, 5, 6] })],
        { source: "dcf.engineering.n_plus_one via report.json. Required = design demand x (1 + design margin). Generator unit rating is shown after derating." }),
      panel("Utilisation after one unit loss", [chart({ title: "Required capacity as a share of remaining capacity", labels: elecChecks.map((c) => names[c.key]), xLabel: "", yLabel: "Utilisation", unit: "%", decimals: 1, height: 240, tickEvery: 1,
        yMin: 0, yMax: 100, series: [{ name: "Utilisation after loss", values: elecChecks.map((c) => c.utilisation_after_loss * 100), kind: "bar" }],
        source: "derived.n_plus_one_checks in core.json (required / remaining capacity)" })])),
    h("div", { class: "grid two" },
      panel("Design power path", [table(["Stage", "Power (kW)", "Share of facility"], [
        ["Critical IT load", bal.it_kw, bal.it_kw], ["Distribution loss", bal.distribution_loss_kw, bal.distribution_loss_kw], ["UPS loss", bal.ups_loss_kw, bal.ups_loss_kw],
        ["Fans", bal.fan_kw, bal.fan_kw], ["Compressors", bal.compressor_kw, bal.compressor_kw], ["Pumps", bal.pump_kw, bal.pump_kw], ["Other facility", bal.other_kw, bal.other_kw],
        ["Transformer loss", bal.transformer_loss_kw, bal.transformer_loss_kw], ["Facility total", bal.facility_kw, bal.facility_kw]]
        .map(([n, v]) => [n as string, fixed(v as number, 1), `${fixed(((v as number) / bal.facility_kw) * 100, 1)}%`]), { num: [1, 2] })],
        { source: "report.json sizing.design_balance. Steady state at full IT load and design ambient." }),
      panel("Energy storage allowances", [table(["Item", "Value", "Basis"], [
        ["UPS battery per path", `${group(sz.battery_per_path_kwh, 0)} kWh`, `${core.config.battery_minutes} min at UPS output, with inverter, usable and end-of-life factors`],
        ["BESS nameplate", `${group(sz.bess_nameplate_kwh, 0)} kWh`, `${group(core.config.bess_supported_kw)} kW for ${core.config.bess_hours} h with discharge, usable and end-of-life factors`],
        ["Battery chemistry, strings", "not defined", "Discharge curves and thermal review are required"]])],
        { source: "report.json sizing; configs/tropical-5mw.json. Energy screen only." })));
  drawDiagram(); drawDetail();
  return { el };
}

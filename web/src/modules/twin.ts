import type { Ctx } from "../main";
import { activeData } from "../state";
import type { Equipment, Hall, ModuleView, Rack } from "../types";
import type { ColorMode, Layers, Picked, TwinScene } from "../twin3d";
import { fmtLength } from "../units";
import { RACK_UNIT_LIST } from "../models/rack-units";
import { chip, fixed, group, h } from "../util";

const SYSTEM_NAME: Record<string, string> = { UPS: "Uninterruptible power supply", TX: "Transformer", GEN: "Generator", CHL: "Chiller", CDU: "Coolant distribution unit" };
const MISSING = "Not available in source data";

function row(dl: HTMLElement, term: string, value: Node | string | null, missing = false) {
  dl.append(h("dt", {}, term), h("dd", { class: missing || value === null ? "missing" : "" }, value ?? MISSING));
}

export function twinModule(ctx: Ctx): ModuleView {
  const data = activeData(ctx.store);
  const twin = data.twin;
  const layers: Layers = { leds: true, aisles: true, halls: true, racks: true, electrical: true, cooling: true, relations: true, labels: true };
  let mode: ColorMode = "hall";
  let zone = "overview";
  const canvas = h("canvas", { "aria-label": "Interactive 3D model of the data center halls, racks and plant. Use the asset list or search for keyboard access.", tabindex: "0" }) as HTMLCanvasElement;
  const inspector = h("div", { class: "panel-body", "aria-live": "polite" });
  const hoverTip = h("div", { class: "chart-tip", style: "position:fixed;z-index:60" });
  hoverTip.hidden = true;
  const zones = h("div", { class: "side-zones" });
  const colorLegend = h("div", { class: "legend-key" });
  let scene: TwinScene | null = null;
  let selected: Picked | null = null;

  const linkTag = (id: string) => h("button", { class: "tag", type: "button", title: `Select ${id}`, onClick: () => pick({ kind: id.includes("-R") ? "rack" : "equipment", id }, true) }, id);
  const tagList = (ids: string[]) => ids.length ? h("div", { class: "tags" }, ...ids.map(linkTag)) : null;

  function pick(p: Picked | null, focus = false) {
    selected = p;
    scene?.select(p, false);
    if (p && focus) scene?.focusOn(p);
    drawInspector(); refreshDims();
  }

  function drawInspector() {
    if (!selected) {
      const dl = h("dl", { class: "kv" });
      row(dl, "Halls", String(twin.halls.length)); row(dl, "Racks", String(twin.racks.length));
      row(dl, "Plant assets", String(twin.equipment.length));
      row(dl, "Design IT", `${group(twin.halls.reduce((a, x) => a + x.design_kw, 0))} kW`);
      inspector.replaceChildren(h("p", { class: "empty" }, "Select a rack, an equipment block or a hall in the 3D view, or pick one from the list. The asset ID is the key for all linked records."), dl,
        ...twin.notes.map((n) => h("p", { class: "unit" }, n)));
      return;
    }
    if (selected.kind === "rack") inspector.replaceChildren(...rackView(twin.racks.find((r) => r.asset_id === selected!.id)!));
    else if (selected.kind === "hall") inspector.replaceChildren(...hallView(twin.halls.find((x) => x.id === selected!.id)!));
    else inspector.replaceChildren(...equipmentView(twin.equipment.find((e) => e.asset_id === selected!.id)!));
  }

  function telemetryBlock(records: { timestamp: string; metric: string; value: number; unit: string; quality: string; source: string }[], design?: number): HTMLElement {
    if (!records.length) return h("div", { class: "tel" }, h("b", {}, "Telemetry"), h("span", { class: "unit" }, "No telemetry records for this asset in the source data."));
    return h("div", { class: "tel" }, h("b", {}, "Telemetry"), ...records.map((t) => h("div", {},
      h("div", {}, `${t.metric.replace(/_/g, " ")}: `, h("b", {}, `${fixed(t.value, 2)} ${t.unit}`), design ? ` (${fixed((t.value / design) * 100, 0)}% of design allowance)` : ""),
      h("div", { class: "unit" }, `Timestamp ${t.timestamp}`), h("div", { class: "unit" }, `Source ${t.source}; quality ${t.quality}`),
      h("div", {}, chip("simulated", t.quality === "synthetic" ? "Synthetic data" : t.quality)))));
  }

  const UNIT_NOTE: Record<string, string> = {
    srv2: "Front faceplate with ear handles, 4 drive bays, vent field and a status LED.",
    srv4: "Front faceplate with ear handles, 8 drive bays, vent field and a status LED.",
    sw: "Front faceplate with 24 ports and a status LED.", blank: "Blank filler panel for airflow separation.",
    cable: "Horizontal cable manager with a row of cable guides.", patch: "24 port patch panel.",
  };
  function unitCard(r: Rack, index: number): HTMLElement {
    const u = RACK_UNIT_LIST[index], dl = h("dl", { class: "kv" });
    row(dl, "Slot", u.u === 1 ? `U${u.u0}` : `U${u.u0} to U${u.u0 + u.u - 1}`); row(dl, "Height", `${fixed(u.u * 44.45, 1)} mm (${u.u}U)`);
    row(dl, "Mounting", "19 inch front rails, 482.6 mm faceplate"); row(dl, "Faceplate", UNIT_NOTE[u.kind]);
    row(dl, "Telemetry", u.kind === "srv2" || u.kind === "srv4" ? "Not modeled per unit. Rack level telemetry only." : "Not modeled");
    const sel = h("select", { "aria-label": "Choose a unit in this rack", onChange: (e: Event) => pick({ kind: "rack", id: r.asset_id, unit: Number((e.target as HTMLSelectElement).value) }, true) },
      ...RACK_UNIT_LIST.slice().reverse().map((x) => h("option", { value: String(x.index), selected: x.index === index ? "" : undefined }, `${x.u === 1 ? "U" + x.u0 : "U" + x.u0 + "-U" + (x.u0 + x.u - 1)}  ${x.label}`)));
    return h("div", { class: "tel" }, h("b", {}, `${u.label}, ${r.asset_id}`), dl, sel,
      h("div", { class: "tags" }, chip("design", "Generic configuration"), chip("simulated", "Illustrative layout, not source data")),
      h("button", { class: "btn", type: "button", onClick: () => pick({ kind: "rack", id: r.asset_id }, true) }, "Back to rack"));
  }
  function rackView(r: Rack): Node[] {
    const dl = h("dl", { class: "kv" });
    row(dl, "Asset ID", h("span", { class: "id" }, r.asset_id)); row(dl, "Equipment category", "IT rack (white space)"); row(dl, "Hall or location", r.hall_id);
    row(dl, "System relationship", "Dual-corded to A and B power paths; liquid and air cooling split");
    row(dl, "Rated capacity", MISSING, true); row(dl, "Design allowance", `${fixed(r.design_kw, 1)} kW`);
    row(dl, "Electrical path", `${r.power_a} and ${r.power_b}`);
    row(dl, "Path A equipment", tagList(r.relations.path_a_equipment)); row(dl, "Path B equipment", tagList(r.relations.path_b_equipment));
    row(dl, "Cooling relationship", `${fixed(r.liquid_design_kw, 1)} kW liquid, ${fixed(r.air_design_kw, 1)} kW air (design split)`);
    row(dl, "Hall CDUs", tagList(r.relations.cdu_ids)); row(dl, "Chillers (shared)", tagList(r.relations.chiller_ids));
    row(dl, "Position", `x ${fixed(r.x, 1)} m, y ${fixed(r.y, 1)} m (display only)`);
    row(dl, "Engineering notes", r.relations.note);
    const unitBox = selected?.unit !== undefined ? [unitCard(r, selected.unit)] : [h("button", { class: "btn", type: "button", onClick: () => pick({ kind: "rack", id: r.asset_id, unit: 0 }, true) }, "Inspect units (U1 to U42)")];
    return [h("div", {}, h("h3", {}, "Rack"), h("p", { class: "unit" }, "Linked by asset ID")), ...unitBox, dl, telemetryBlock(r.telemetry, r.design_kw),
      h("div", { class: "tags" }, chip("design", "Design allowance"), chip("modeled", "Cooling split from config"))];
  }
  function equipmentView(e: Equipment): Node[] {
    const g = e.group, dl = h("dl", { class: "kv" });
    const where = e.system === "CDU" ? e.path : "Plant yard, schematic display position";
    row(dl, "Asset ID", h("span", { class: "id" }, e.asset_id)); row(dl, "Equipment category", SYSTEM_NAME[e.system] ?? e.system); row(dl, "Hall or location", where);
    row(dl, "System relationship", e.system === "CDU" ? `Serves racks in ${e.path}` : e.path === "SHARED" ? "Shared chilled-water plant for all halls" : `Path ${e.path}, serves all halls`);
    row(dl, "Rated capacity", `${group(e.nameplate)} ${e.unit}, derating ${fixed(e.derating, 2)}`);
    row(dl, "Design allowance", `Group requires ${group(g.required, 0)} ${e.unit}; ${g.duty_units} duty + ${g.spare_units} spare; ${group(g.remaining_capacity_after_one_loss, 0)} ${e.unit} left after one loss`);
    row(dl, "Electrical path", ["UPS", "TX", "GEN"].includes(e.system) ? `Path ${e.path}` : "Not applicable at this concept level");
    row(dl, "Cooling relationship", e.system === "CDU" ? "Liquid loop interface for the hall" : e.system === "CHL" ? "Produces chilled water for halls and CDUs" : "Not applicable");
    row(dl, "Status", e.status); row(dl, "Engineering notes", e.display_position.placement === "schematic" && e.system !== "CDU" ? "Display position is schematic. The source geometry does not place plant." : "CDU position is a display position within the hall.");
    return [h("div", {}, h("h3", {}, SYSTEM_NAME[e.system] ?? e.system), h("p", { class: "unit" }, "Linked by asset ID")), dl, telemetryBlock(e.telemetry), h("div", { class: "tags" }, chip("design", "Concept allowance"))];
  }
  function hallView(x: Hall): Node[] {
    const dl = h("dl", { class: "kv" });
    row(dl, "Hall ID", h("span", { class: "id" }, x.id)); row(dl, "Racks", String(x.rack_count)); row(dl, "Design IT", `${group(x.design_kw)} kW`);
    row(dl, "Footprint", `${fixed(x.width, 1)} m by ${fixed(x.depth, 1)} m, ${fixed(x.height, 1)} m high`); row(dl, "Area", `${group(x.width * x.depth, 0)} m2`);
    row(dl, "Hall CDUs", tagList(x.cdu_ids)); row(dl, "Engineering notes", "Parametric hall from rack pitch. Egress, fire compartments and structure are not modeled.");
    return [h("div", {}, h("h3", {}, "Data hall")), dl, h("div", { class: "tags" }, chip("design", "Design basis"))];
  }

  function drawZones() {
    const items = [["overview", "Facility overview"], ...twin.halls.map((x) => [x.id, `Hall ${x.id}`]), ["plant", "Plant yard"]];
    zones.replaceChildren(...items.map(([id, name]) => h("button", { class: "list-btn", type: "button", "aria-pressed": String(zone === id), onClick: () => { zone = id; scene?.flyTo(id); drawZones(); if (id.startsWith("H")) pick({ kind: "hall", id }); else if (selected) pick(null); } }, name)));
  }
  function layerBox(key: keyof Layers, text: string) {
    return h("label", { class: "check" }, h("input", { type: "checkbox", checked: layers[key] ? "" : undefined, onChange: (e: Event) => { layers[key] = (e.target as HTMLInputElement).checked; scene?.setLayers(layers); } }), text);
  }
  function setMode(m: ColorMode) { mode = m; scene?.setColorMode(m); legend(); modeBar.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m))); }
  function legend() {
    const [lo, hi] = scene?.telemetryRange() ?? [0, 0];
    colorLegend.textContent = mode === "hall" ? "Racks coloured by hall" : mode === "neutral" ? "Racks neutral" : `Rack colour = synthetic telemetry, ${fixed(lo, 2)} to ${fixed(hi, 2)} kW`;
  }
  const modeBar = h("div", { class: "seg", role: "group", "aria-label": "Rack colour layer" }, ...([["hall", "Hall"], ["telemetry", "Telemetry"], ["neutral", "Neutral"]] as [ColorMode, string][]).map(([m, t]) =>
    h("button", { type: "button", "data-mode": m, "aria-pressed": String(m === mode), onClick: () => setMode(m) }, t)));
  // ---- CAD tools: standard views, projection, section plane, measure, dimension box ----
  const cadReadout = h("p", { class: "muted", style: "margin:6px 0 0;font-size:.875rem", "aria-live": "polite" }, "Measure: off");
  const bounds = { x: [Math.min(...twin.halls.map((x) => x.x)), Math.max(...twin.halls.map((x) => x.x + x.width))], y: [0, 4], z: [Math.min(...twin.halls.map((x) => x.y)), Math.max(...twin.halls.map((x) => x.y + x.depth))] } as Record<"x" | "y" | "z", number[]>;
  let sectionAxis: "x" | "y" | "z" | "" = "", measuring = false, dims = false;
  const secSlider = h("input", { type: "range", min: "0", max: "100", value: "50", disabled: "", "aria-label": "Section plane position", style: "width:100%", onInput: () => applySection() }) as HTMLInputElement;
  const secSelect = h("select", { "aria-label": "Section axis", onChange: (e: Event) => { sectionAxis = (e.target as HTMLSelectElement).value as typeof sectionAxis; secSlider.disabled = !sectionAxis; applySection(); } },
    h("option", { value: "" }, "Section: off"), h("option", { value: "y" }, "Section: horizontal (Y)"), h("option", { value: "x" }, "Section: X"), h("option", { value: "z" }, "Section: Z")) as HTMLSelectElement;
  function applySection() {
    if (!sectionAxis) { scene?.setSection(null); return; }
    const [lo, hi] = bounds[sectionAxis]; scene?.setSection(sectionAxis, lo + (hi - lo) * (Number(secSlider.value) / 100));
  }
  function refreshDims() {
    const rackSel = selected?.kind === "rack"; explodeBtn.disabled = !rackSel && !scene?.isExploded; if (!scene?.isExploded) syncExplode(false);
     const d = scene?.showDimensions(dims); dimReadout.textContent = dims ? (d ? d.text : "Select an item to see its size") : ""; }
  const dimReadout = h("p", { class: "muted", style: "margin:6px 0 0;font-size:.875rem" }, "");
  const projBtn = h("button", { class: "btn", type: "button", "aria-pressed": "false", onClick: () => { const on = !scene?.isOrtho; scene?.setProjection(on); projBtn.setAttribute("aria-pressed", String(on)); projBtn.textContent = on ? "Orthographic" : "Perspective"; } }, "Perspective");
  const explodeBtn = h("button", { class: "btn", type: "button", disabled: "", "aria-pressed": "false", onClick: () => { const on = !scene?.isExploded; scene?.explode(on); syncExplode(on); } }, "Explode selected rack") as HTMLButtonElement;
  function syncExplode(on: boolean) { explodeBtn.setAttribute("aria-pressed", String(on)); explodeBtn.textContent = on ? "Assemble rack" : "Explode selected rack"; }
  const measBtn = h("button", { class: "btn", type: "button", "aria-pressed": "false", onClick: () => { measuring = !measuring; scene?.setMeasure(measuring); measBtn.setAttribute("aria-pressed", String(measuring)); cadReadout.textContent = measuring ? "Click two points on a surface" : "Measure: off"; } }, "Measure");
  const cadPanel = h("section", { class: "panel" }, h("header", { class: "panel-head" }, h("h2", {}, "CAD tools")), h("div", { class: "panel-body", style: "padding:8px;display:grid;gap:8px" },
    h("div", { class: "seg fill", role: "group", "aria-label": "Standard views" }, ...([["plan", "Plan"], ["front", "Front"], ["side", "Side"], ["iso", "Iso"]] as const).map(([v, t]) => h("button", { type: "button", onClick: () => scene?.setView(v) }, t))),
    projBtn, secSelect, secSlider, measBtn, cadReadout, explodeBtn,
    h("label", { class: "check" }, h("input", { type: "checkbox", onChange: (e: Event) => { dims = (e.target as HTMLInputElement).checked; refreshDims(); } }), "Dimension box of selection"), dimReadout));
  const search = h("input", { type: "search", list: "asset-list", placeholder: "Asset ID, e.g. H02-R017", "aria-label": "Find asset by ID", style: "width:100%",
    onChange: (e: Event) => { const v = (e.target as HTMLInputElement).value.trim().toUpperCase(); const r = twin.racks.find((x) => x.asset_id === v); const q = twin.equipment.find((x) => x.asset_id === v);
      if (r) pick({ kind: "rack", id: r.asset_id }, true); else if (q) pick({ kind: "equipment", id: q.asset_id }, true); } });
  const datalist = h("datalist", { id: "asset-list" }, ...[...twin.racks.map((r) => r.asset_id), ...twin.equipment.map((e) => e.asset_id)].map((id) => h("option", { value: id })));

  const stage = h("div", { class: "twin-stage" }, canvas,
    h("div", { class: "twin-hud" }, h("button", { class: "btn", type: "button", onClick: () => { scene?.flyTo("overview"); zone = "overview"; drawZones(); } }, "Reset camera"), modeBar,
      h("button", { class: "btn", type: "button", onClick: () => pick(null) }, "Clear selection")),
    h("div", { class: "twin-foot" }, h("span", {}, "Drag orbit. Scroll zoom. Right-drag pan. Click to inspect."), h("span", {}, "Plant positions are schematic. LED rate follows synthetic telemetry.")), hoverTip);
  const el = h("div", { class: "stack" },
    h("div", { class: "page-head" }, h("p", { class: "pattern" }, "Split pane"), h("h1", {}, "Facility Digital Twin"),
      h("p", {}, "Browser view of the rack layout from the Python geometry module, linked to equipment records by asset ID. Telemetry is a synthetic offline example, not a live feed. The source OpenUSD is rack-only massing, not a facility BIM model.")),
    h("div", { class: "twin-layout" },
      h("div", { class: "side left" },
        h("section", { class: "panel" }, h("header", { class: "panel-head" }, h("h2", {}, "Zones")), h("div", { class: "panel-body", style: "padding:8px" }, zones)),
        h("section", { class: "panel" }, h("header", { class: "panel-head" }, h("h2", {}, "Layers")), h("div", { class: "panel-body", style: "padding:8px" },
          layerBox("racks", "Racks"), layerBox("halls", "Hall shells"), layerBox("aisles", "Aisle containment"), layerBox("leds", "Rack LEDs"), layerBox("electrical", "Electrical plant"), layerBox("cooling", "Cooling plant"), layerBox("relations", "Relationship lines"), layerBox("labels", "Labels"), colorLegend)),
        h("section", { class: "panel" }, h("header", { class: "panel-head" }, h("h2", {}, "Find asset")), h("div", { class: "panel-body" }, search, datalist,
          h("div", { class: "tags" }, ...["UPS-A-01", "GEN-B-01", "CHL-SHARED-01", "CDU-H01-01"].map((id) => h("button", { class: "tag", type: "button", onClick: () => pick({ kind: "equipment", id }, true) }, id)))))),
      stage,
      h("div", { class: "side" }, cadPanel, h("section", { class: "panel" }, h("header", { class: "panel-head" }, h("h2", {}, "Equipment inspector")), inspector))));
  drawZones(); drawInspector();

  let gone = false;
  let dispose: (() => void) | undefined = () => { gone = true; };
  // three.js loads only when this page opens, so the other pages start faster
  requestAnimationFrame(async () => {
    try {
      const { TwinScene: Scene } = await import("../twin3d");
      if (gone) return;
      scene = new Scene(canvas, twin);
    } catch (e) {
      stage.replaceChildren(h("p", { class: "error", style: "margin:16px" }, `3D view could not start: ${(e as Error).message}. WebGL is required. Use the asset list and inspector instead.`));
      return;
    }
    scene.onSelect = (p) => { selected = p; drawInspector(); refreshDims(); };
    scene.onMeasure = (m, pending) => { cadReadout.textContent = m ? `${fmtLength(m.distance)} (dx ${fmtLength(m.dx)}, dy ${fmtLength(m.dy)}, dz ${fmtLength(m.dz)})` : pending ? "Click the second point" : measuring ? "Click two points on a surface" : "Measure: off"; };
    scene.onHover = (id, x, y) => { if (!id) { hoverTip.hidden = true; return; } hoverTip.hidden = false; hoverTip.textContent = id; hoverTip.style.left = `${x + 14}px`; hoverTip.style.top = `${y + 14}px`; };
    legend();
    (window as any).__twin = { select: (id: string) => { const r = twin.racks.find((x) => x.asset_id === id); pick(r ? { kind: "rack", id } : { kind: "equipment", id }, true); },
      screenOf: (id: string) => scene!.screenOf(id), selected: () => selected, flyTo: (z: string) => scene!.flyTo(z, true), setMode, layers: (l: Partial<Layers>) => { Object.assign(layers, l); scene!.setLayers(layers); },
      stats: () => ({ frames: scene!.renderedFrames, calls: scene!.renderer.info.render.calls, triangles: scene!.renderer.info.render.triangles }),
      cad: { setView: (v: any) => scene!.setView(v), ortho: (o: boolean) => scene!.setProjection(o), section: (a: any, o: number) => scene!.setSection(a, o), dims: (on: boolean) => scene!.showDimensions(on), measure: (on: boolean) => scene!.setMeasure(on) },
      look: (p: number[], t: number[]) => { scene!.camera.position.set(p[0], p[1], p[2]); scene!.controls.target.set(t[0], t[1], t[2]); scene!.controls.update(); scene!.invalidate(); } };
    dispose = () => { gone = true; scene?.dispose(); delete (window as any).__twin; };
  });
  return { el, dispose: () => dispose?.() };
}

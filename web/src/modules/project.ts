import type { Ctx } from "../main";
import { renderMarkdown } from "../markdown";
import { activeData } from "../state";
import type { ModuleView } from "../types";
import { chip, group, h, note, panel, table } from "../util";
import { linkRule } from "./docs";

export function projectModule(ctx: Ctx): ModuleView {
  const store = ctx.store;
  const data = activeData(store);
  const prov = data.core.provenance;
  const maturity = store.docs.find((d) => d.path === "docs/maturity.md");
  const files = store.manifest.files as Record<string, string>;
  const source = store.manifest.source_manifest as Record<string, string>;
  const el = h("div", { class: "stack" },
    h("div", { class: "page-head" }, h("p", { class: "pattern" }, "Detail"), h("h1", {}, "Project Information"),
      h("p", {}, "What this project is, how mature it is, where its numbers come from and what it does not claim.")),
    note("Open Data Center Facility is an independent concept-engineering portfolio. It is not a certified facility design, a construction package, a coordinated BIM model, a validated CFD study or a deployed operational digital twin.", "warn"),
    h("div", { class: "grid two" },
      panel("Identity", [table(["Item", "Value"], [["Project", "Open Data Center Facility"], ["Model version", prov.model_version], ["Scenario", prov.scenario], ["Status", prov.status],
        ["Reference configuration SHA-256", h("span", { class: "mono" }, prov.config_sha256.slice(0, 24) + "...")], ["Data origin", prov.origin], ["Author", "Jonathan Oktaviano"], ["License", "MIT"],
        ["Repository", h("a", { href: "https://github.com/robotjaol/open-datacenter", rel: "noopener noreferrer" }, "github.com/robotjaol/open-datacenter")]])], { source: "core.json provenance; pyproject.toml; LICENSE" }),
      panel("Data provenance classes", [table(["Class", "Meaning"], Object.entries(prov.classes as Record<string, string>).map(([k, v]) => [chip(k), v])),
        h("p", {}, `Synthetic data is used for weather, the hourly IT load and rack telemetry. Design capacity: ${group(data.core.config.it_kw)} kW across ${data.core.config.halls} halls.`)], { source: "dcf/webdata.py" })),
    panel("Data integrity", [h("p", {}, "The exporter checks every committed reference artifact against artifacts/reference/manifest.json before building web data, and refuses to export on a mismatch."),
      table(["Web data file", "SHA-256"], Object.entries(files).map(([k, v]) => [k, h("span", { class: "mono" }, v.slice(0, 32) + "...")])),
      table(["Source artifact", "SHA-256"], Object.entries(source).map(([k, v]) => [k, h("span", { class: "mono" }, v.slice(0, 32) + "...")]))], { source: "build/web-data/manifest.json and artifacts/reference/manifest.json" }),
    panel("Maturity and next gates", [maturity ? renderMarkdown(maturity.text, linkRule(maturity.path, store.docs, () => {})) : h("p", {}, "Maturity document not found.")], { source: "docs/maturity.md" }));
  return { el };
}

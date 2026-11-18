import "./style.css";
import { icon } from "./icons";
import { activeData, loadStore, type Store } from "./state";
import type { ModuleView } from "./types";
import { chip, h } from "./util";
import { overview } from "./modules/overview";
import { twinModule } from "./modules/twin";
import { electrical } from "./modules/electrical";
import { mechanical } from "./modules/mechanical";
import { energy } from "./modules/energy";
import { reliability } from "./modules/reliability";
import { finance } from "./modules/finance";
import { scenarioModule } from "./modules/scenario";
import { docsModule } from "./modules/docs";
import { projectModule } from "./modules/project";

export interface Ctx { store: Store; render: () => void; go: (route: string) => void }

interface Route { id: string; label: string; icon: string; title: string; build: (ctx: Ctx) => ModuleView }

const ROUTES: Route[] = [
  { id: "overview", label: "Executive Overview", icon: "overview", title: "Executive Overview", build: overview },
  { id: "twin", label: "Facility Digital Twin", icon: "twin", title: "Facility Digital Twin", build: twinModule },
  { id: "electrical", label: "Electrical Infrastructure", icon: "electrical", title: "Electrical Infrastructure", build: electrical },
  { id: "mechanical", label: "Mechanical and Cooling", icon: "cooling", title: "Mechanical and Cooling", build: mechanical },
  { id: "energy", label: "Energy and Sustainability", icon: "energy", title: "Energy and Sustainability", build: energy },
  { id: "reliability", label: "Reliability and Capacity", icon: "reliability", title: "Reliability and Capacity", build: reliability },
  { id: "finance", label: "Financial Analysis", icon: "finance", title: "Financial Analysis", build: finance },
  { id: "scenario", label: "Scenario Explorer", icon: "scenario", title: "Scenario Explorer", build: scenarioModule },
  { id: "docs", label: "Engineering Documentation", icon: "docs", title: "Engineering Documentation", build: docsModule },
  { id: "project", label: "Project Information", icon: "project", title: "Project Information", build: projectModule },
];

function routeId(): string {
  const id = location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0];
  return ROUTES.some((r) => r.id === id) ? id : "overview";
}

async function start() {
  const app = document.getElementById("app")!;
  app.replaceChildren(h("main", { id: "main", style: "padding:48px" }, h("div", { class: "status" }, h("i", { class: "spinner" }), "Loading engineering data")));
  let store: Store;
  try {
    store = await loadStore();
  } catch (error) {
    app.replaceChildren(h("main", { id: "main", style: "padding:48px;max-width:640px" },
      h("h1", {}, "Engineering data not found"),
      h("p", { class: "error" }, String(error)),
      h("p", {}, "Generate the data with ", h("code", {}, "python -m dcf.cli web-data"), " and start the server with ",
        h("code", {}, "python -m dcf.cli serve"), ".")));
    return;
  }
  let current: ModuleView | null = null;
  const ctx: Ctx = { store, render: () => draw(), go: (r) => { location.hash = `#/${r}`; } };

  function draw() {
    current?.dispose?.();
    const id = routeId();
    const route = ROUTES.find((r) => r.id === id)!;
    document.title = `${route.title} - Open Data Center Facility`;
    const data = activeData(store);
    const view = route.build(ctx);
    current = view;
    const nav = h("nav", { class: "nav", "aria-label": "Modules" }, ...ROUTES.map((r) =>
      h("a", { href: `#/${r.id}`, "aria-current": r.id === id ? "page" : undefined }, icon(r.icon), r.label)));
    const sidebar = h("aside", { class: "sidebar", id: "sidebar" },
      h("div", { class: "brand" }, brandMark(), h("div", {}, h("b", {}, "Open Data Center"), h("span", {}, "Digital twin, 5 MW concept"))),
      nav,
      h("p", { class: "sidebar-foot" }, `Model ${data.core.provenance.model_version}. Concept engineering; synthetic inputs.`));
    const menu = h("button", { class: "btn icon menu-btn", type: "button", "aria-label": "Open navigation", "aria-expanded": "false",
      onClick: () => { const open = sidebar.classList.toggle("open"); menu.setAttribute("aria-expanded", String(open)); } }, icon("overview"));
    nav.addEventListener("click", () => sidebar.classList.remove("open"));
    const scenarioChip = store.active === "scenario" ? chip("scenario", "Scenario results") : chip("design", "Reference scenario");
    scenarioChip.classList.add(store.active === "scenario" ? "chip-scenario" : "x");
    const top = h("header", { class: "topbar" }, menu, h("h1", {}, route.title),
      chip("warn", "Concept engineering"), chip("simulated", "Synthetic inputs"), scenarioChip,
      h("span", { class: "chip" }, h("i", { class: `dot ${store.apiOnline ? "" : ""}`, style: `background:${store.apiOnline ? "var(--green)" : "var(--faint)"};border-radius:50%` }),
        store.apiOnline ? "Python engine online" : "Python engine offline"));
    const banner = store.active === "scenario" ? h("div", { class: "banner", role: "status" },
      h("span", {}, "You are viewing an unsaved scenario run. The reference scenario and its artifacts are unchanged."),
      h("button", { class: "btn", type: "button", onClick: () => { store.active = "reference"; draw(); } }, "Return to reference")) : null;
    const main = h("main", { id: "main", tabindex: "-1" }, banner, view.el);
    app.replaceChildren(h("div", { class: "app" }, sidebar, h("div", { class: "main-col" }, top, main)));
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", draw);
  draw();
}

function brandMark(): Element {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 32 32"); svg.setAttribute("width", "32"); svg.setAttribute("height", "32"); svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<rect width="32" height="32" rx="6" fill="#1c232c" stroke="rgba(255,255,255,.16)"/><path d="M8 11h16M8 16h16M8 21h16" stroke="#38bdf8" stroke-width="2.4" stroke-linecap="round"/><circle cx="22" cy="11" r="1.4" fill="#7c9cff"/>';
  return svg;
}

start();

import type { Kpi } from "./types";

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, any>;

// build a DOM node
export function h(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "html") node.innerHTML = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function svgEl(tag: string, attrs: Attrs = {}, ...children: (Node | string)[]): SVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  for (const child of children) node.append(child instanceof Node ? child : document.createTextNode(child));
  return node;
}

export function group(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fixed(n: number | null | undefined, decimals = 2): string {
  return n === null || n === undefined || !Number.isFinite(n) ? "n/a" : group(n, decimals);
}

// short axis labels
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${trim(n / 1e9)}G`;
  if (a >= 1e6) return `${trim(n / 1e6)}M`;
  if (a >= 1e4) return `${trim(n / 1e3)}k`;
  return trim(n);
}
function trim(n: number): string {
  return Number(n.toPrecision(3)).toString();
}

export interface Shown { text: string; unit: string }

// value plus unit at a sensible precision
export function formatKpi(k: Kpi): Shown {
  const v = k.value;
  if (v === null || v === undefined) return { text: "not defined", unit: "" };
  switch (k.unit) {
    case "kWh/yr": return v >= 1e6 ? { text: group(v / 1e6, 2), unit: "GWh/yr" } : { text: group(v, 0), unit: k.unit };
    case "USD": case "USD/yr": return Math.abs(v) >= 1e6 ? { text: group(v / 1e6, 2), unit: `USD M${k.unit === "USD/yr" ? "/yr" : ""}` }
      : { text: group(v, 0), unit: k.unit };
    case "ratio":
      if (k.id === "pue") return { text: group(v, 3), unit: "" };
      if (k.id === "irr") return { text: group(v * 100, 2), unit: "%" };
      if (k.id === "availability") return { text: group(v * 100, 4), unit: "%" };
      return { text: group(v, 3), unit: "" };
    case "years": return { text: group(v, 1), unit: "years" };
    case "L/kWh IT": return { text: group(v, 3), unit: k.unit };
    case "tCO2e/yr": return { text: group(v, 0), unit: k.unit };
    case "count": return { text: group(v, 0), unit: "" };
    default: return { text: group(v, v % 1 === 0 ? 0 : 1), unit: k.unit };
  }
}

export function usdM(n: number | null, decimals = 2): string {
  return n === null ? "n/a" : `${group(n / 1e6, decimals)} M`;
}

export function percent(n: number | null, decimals = 1): string {
  return n === null || !Number.isFinite(n) ? "n/a" : `${group(n * 100, decimals)}%`;
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = h("a", { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n") + "\n";
}

export const PROVENANCE_LABEL: Record<string, string> = {
  design: "Design basis", modeled: "Modeled", simulated: "Simulated, synthetic profile", financial: "Financial assumption",
};

export function chip(kind: string, text?: string): HTMLElement {
  return h("span", { class: `chip chip-${kind}` }, h("i", { class: "dot", "aria-hidden": "true" }), text ?? PROVENANCE_LABEL[kind] ?? kind);
}

// info button with tooltip text
export function info(text: string): HTMLElement {
  return h("button", { class: "info", type: "button", "aria-label": text, "data-tip": text }, "i");
}

export function panel(title: string, body: Node[], opts: { source?: string; actions?: Node[]; cls?: string } = {}): HTMLElement {
  return h("section", { class: `panel ${opts.cls ?? ""}` },
    h("header", { class: "panel-head" }, h("h2", {}, title), opts.actions ? h("div", { class: "panel-actions" }, ...opts.actions) : null),
    h("div", { class: "panel-body" }, ...body),
    opts.source ? h("p", { class: "source" }, `Source: ${opts.source}`) : null);
}

export function table(headers: string[], rows: (string | number | Node | null)[][], opts: { cls?: string; num?: number[] } = {}): HTMLElement {
  const num = new Set(opts.num ?? []);
  return h("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-label": "Data table" },
    h("table", { class: `tbl ${opts.cls ?? ""}` },
      h("thead", {}, h("tr", {}, ...headers.map((t, i) => h("th", { scope: "col", class: num.has(i) ? "num" : "" }, t)))),
      h("tbody", {}, ...rows.map((r) => h("tr", {}, ...r.map((c, i) => h("td", { class: num.has(i) ? "num" : "" }, c as Child)))))));
}

export function note(text: string, kind: "warn" | "info" = "info"): HTMLElement {
  return h("p", { class: `note note-${kind}`, role: kind === "warn" ? "note" : undefined }, text);
}

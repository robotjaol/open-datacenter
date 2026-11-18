import type { Core, Dataset, DocItem, Hourly, RunResult, Tables, Twin } from "./types";

export interface Store {
  reference: Dataset;
  scenario: Dataset | null;
  run: RunResult | null;
  active: "reference" | "scenario";
  docs: DocItem[];
  tables: Tables;
  manifest: Record<string, any>;
  apiOnline: boolean;
}

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function loadStore(): Promise<Store> {
  const [core, hourly, twin, docs, tables, manifest] = await Promise.all([
    json<Core>("/data/core.json"), json<Hourly>("/data/hourly.json"), json<Twin>("/data/twin.json"),
    json<DocItem[]>("/data/docs.json"), json<Tables>("/data/tables.json"), json<Record<string, any>>("/data/manifest.json"),
  ]);
  let apiOnline: boolean;
  try { apiOnline = (await fetch("/api/health")).ok; } catch { apiOnline = false; }
  return { reference: { core, hourly, twin, label: "Reference scenario", kind: "reference" }, scenario: null, run: null,
    active: "reference", docs, tables, manifest, apiOnline };
}

export function activeData(store: Store): Dataset {
  return store.active === "scenario" && store.scenario ? store.scenario : store.reference;
}

export async function runScenario(overrides: Record<string, number>): Promise<RunResult> {
  const response = await fetch("/api/scenario/run", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overrides }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body as RunResult;
}

export async function loadParameters(): Promise<{ parameters: any[] }> {
  return json("/api/scenario/parameters");
}

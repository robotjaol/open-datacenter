// Shapes of the exported web data. Source of truth: dcf/webdata.py.
export type Rec = Record<string, any>;

export interface Kpi {
  id: string; label: string; value: number | null; unit: string; category: string;
  provenance: "design" | "modeled" | "simulated" | "financial"; synthetic: boolean;
  sources: string[]; formula: string | null; description: string;
}

export interface Core {
  schema: string; provenance: Rec; kpis: Kpi[]; config: Rec; sizing: Rec; energy: Rec; finance: Rec;
  sensitivity: Rec[]; reliability: Rec; commissioning: Rec[]; sites: Rec[]; derived: Rec;
}

export interface Hourly {
  start: string; step_hours: number; hours: number; calendar: string; unit_note: string;
  columns: Record<string, number[]>;
}

export interface Aisle { id: string; hall_id: string; kind: "cold" | "hot"; x: number; y: number; width: number; depth: number; contained: boolean; basis: string }
export interface Hall { id: string; x: number; y: number; width: number; depth: number; height: number;
  rack_count: number; design_kw: number; cdu_ids: string[]; aisles: Aisle[] }
export interface Telemetry { timestamp: string; asset_id: string; metric: string; value: number; unit: string; quality: string; source: string }
export interface Rack { facing: "+y" | "-y"; asset_id: string; hall_id: string; x: number; y: number; width: number; depth: number; height: number;
  design_kw: number; power_a: string; power_b: string; liquid_design_kw: number; air_design_kw: number;
  relations: { path_a_equipment: string[]; path_b_equipment: string[]; cdu_ids: string[]; chiller_ids: string[]; note: string };
  telemetry: Telemetry[] }
export interface Equipment { asset_id: string; system: string; path: string; nameplate: number; unit: string; derating: number;
  status: string; group: Rec; serves_halls: string[]; telemetry: Telemetry[];
  display_position: { x: number; y: number; width: number; depth: number; height: number; placement: string } }
export interface Twin { halls: Hall[]; racks: Rack[]; equipment: Equipment[]; notes: string[] }

export interface Dataset { core: Core; hourly: Hourly; twin: Twin; label: string; kind: "reference" | "scenario" }
export interface DocItem { path: string; folder: string; title: string; text: string }
export type Tables = Record<string, Rec[]>;

export interface RunResult {
  changes: { key: string; label: string; unit: string; baseline: number; scenario: number }[];
  comparison: { id: string; label: string; unit: string; baseline: number | null; scenario: number | null; delta: number | null; delta_pct: number | null }[];
  execution: { engine: string; model_version: string; seconds: number; config_sha256: string; status: string; kind: string };
  payload: { core: Core; hourly: Hourly; twin: Twin };
}

export interface ModuleView { el: HTMLElement; dispose?: () => void }

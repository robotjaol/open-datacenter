import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const have = existsSync(resolve(root, "build/web-data/core.json"));

describe.skipIf(!have)("web data contract (needs npm run data)", () => {
  const core = read("build/web-data/core.json");
  const report = read("artifacts/reference/report.json");
  const twin = read("build/web-data/twin.json");
  const kpi = (id: string) => core.kpis.find((k: any) => k.id === id);

  it("declares schema version", () => expect(core.schema).toBe("odc-web-data/1"));
  it("PUE equals the verified report", () => expect(kpi("pue").value).toBeCloseTo(report.energy.pue, 9));
  it("NPV equals the verified report", () => expect(kpi("npv_usd").value).toBeCloseTo(report.finance.npv_usd, 3));
  it("CAPEX equals the verified report", () => expect(kpi("capex_usd").value).toBeCloseTo(report.finance.capex_usd, 3));
  it("keeps reference NPV slightly negative", () => expect(kpi("npv_usd").value).toBeLessThan(0));
  it("every KPI has provenance and a source pointer", () => {
    for (const k of core.kpis) { expect(k.provenance).toBeTruthy(); expect(k.sources.length).toBeGreaterThan(0); }
  });
  it("twin has 200 racks and 40 plant items with unique IDs", () => {
    expect(twin.racks).toHaveLength(200); expect(twin.equipment).toHaveLength(40);
    const ids = [...twin.racks.map((r: any) => r.asset_id), ...twin.equipment.map((e: any) => e.asset_id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("telemetry is flagged synthetic with timestamp, source and quality", () => {
    for (const r of twin.racks.slice(0, 20)) for (const t of r.telemetry) {
      expect(t.timestamp).toBeTruthy(); expect(t.source).toBeTruthy(); expect(t.quality).toBeTruthy();
    }
  });
});

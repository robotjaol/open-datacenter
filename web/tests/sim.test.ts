import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildRoutes, FlowLayer, makeRoute, pointAt } from "../src/flows";
import { extremeHour, flowSpeeds, hourLabel, snapshot } from "../src/sim";
import type { Hourly, Twin } from "../src/types";

const root = resolve(__dirname, "../..");
const have = existsSync(resolve(root, "build/web-data/twin.json"));
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

describe("simulation helpers", () => {
  const hourly: Hourly = { start: "2025-01-01T00:00:00", step_hours: 1, hours: 4, calendar: "x", unit_note: "",
    columns: { it_kw: [100, 200, 150, 120], facility_kw: [130, 250, 200, 150], ambient_c: [20, 30, 25, 22], cooling_kwth: [90, 190, 140, 100], cop: [4, 5, 4.5, 4], compressor_kw: [1, 2, 3, 4], grid_kw: [130, 250, 200, 150], pv_used_kw: [0, 0, 0, 0] } };
  it("labels hours from the start date without a time zone shift", () => {
    expect(hourLabel("2025-01-01T00:00:00", 0)).toBe("2025-01-01 00:00");
    expect(hourLabel("2025-01-01T00:00:00", 25)).toBe("2025-01-02 01:00");
    expect(hourLabel("2025-01-01T00:00:00", 8759)).toBe("2025-12-31 23:00");
  });
  it("computes PUE, load and wraps the hour", () => {
    const s = snapshot(hourly, 1);
    expect(s.pue).toBeCloseTo(1.25, 9); expect(s.load).toBe(1); expect(snapshot(hourly, 0).load).toBe(0);
    expect(snapshot(hourly, 5).hour).toBe(1);
  });
  it("finds extreme hours", () => { expect(extremeHour(hourly, "it_kw", "max")).toBe(1); expect(extremeHour(hourly, "ambient_c", "min")).toBe(0); });
  it("flow speed stays between 35 and 100 percent of the scale", () => {
    const max = { itKw: 200, coolingKwth: 190 };
    expect(flowSpeeds({ itKw: 0, coolingKwth: 0 }, max).power).toBeCloseTo(1.05, 9);
    expect(flowSpeeds({ itKw: 400, coolingKwth: 400 }, max).power).toBeCloseTo(3, 9);
  });
});

describe("flow routes", () => {
  it("walks a polyline by arc length and wraps", () => {
    const r = makeRoute("supply", [new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0), new THREE.Vector3(10, 0, 10)], "t");
    expect(r.length).toBe(20);
    expect(pointAt(r, 5, new THREE.Vector3()).x).toBeCloseTo(5, 9);
    expect(pointAt(r, 15, new THREE.Vector3()).z).toBeCloseTo(5, 9);
    expect(pointAt(r, 25, new THREE.Vector3()).x).toBeCloseTo(5, 9);
  });
  describe.skipIf(!have)("from the reference twin", () => {
    const twin = read("build/web-data/twin.json") as Twin;
    const routes = buildRoutes(twin);
    it("builds power A, power B, supply and return routes with finite points", () => {
      for (const k of ["powerA", "powerB", "supply", "return"]) expect(routes.some((r) => r.kind === k)).toBe(true);
      for (const r of routes) for (const p of r.pts) expect([p.x, p.y, p.z].every(Number.isFinite)).toBe(true);
    });
    it("keeps the particle count inside a budget and moves particles", () => {
      const layer = new FlowLayer(routes);
      expect(layer.count).toBeGreaterThan(200); expect(layer.count).toBeLessThan(4000);
      const a = Array.from((layer.object.geometry.getAttribute("position").array as Float32Array).slice(0, 3));
      layer.update(0.5, 3, 2);
      const b = Array.from((layer.object.geometry.getAttribute("position").array as Float32Array).slice(0, 3));
      expect(a).not.toEqual(b);
    });
  });
});

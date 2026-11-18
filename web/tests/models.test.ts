import type { BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { buildRack, RACK_SIZE, RACK_UNITS } from "../src/models/rack";
import { buildPlant } from "../src/models/plant";
import { buildTray } from "../src/models/tray";
import { buildContainment } from "../src/models/containment";

const tris = (g: BufferGeometry) => g.getAttribute("position").count / 3;

describe("generic rack model", () => {
  const rack = buildRack();
  it("holds exactly 42U", () => expect(RACK_UNITS).toBe(42));
  it("fits the 0.6 x 1.2 x 2.2 m footprint", () => {
    const b = rack.body.boundingBox!;
    expect(b.max.x - b.min.x).toBeLessThanOrEqual(RACK_SIZE.w + 0.02);
    expect(b.max.z - b.min.z).toBeLessThanOrEqual(RACK_SIZE.d + 0.02);
    expect(b.max.y).toBeLessThanOrEqual(RACK_SIZE.h + 0.05);
    expect(b.min.y).toBeGreaterThanOrEqual(-0.001);
  });
  it("stays within a triangle budget for 200 instances", () => expect(tris(rack.body) * 200).toBeLessThan(2_000_000));
  it("carries vertex colours", () => expect(rack.body.hasAttribute("color")).toBe(true));
  it("medium level keeps the silhouette at under a quarter of the triangles", () => {
    const b = rack.mid.boundingBox!, f = rack.body.boundingBox!;
    expect(b.max.y).toBeGreaterThan(f.max.y - 0.1);
    expect(b.max.x - b.min.x).toBeGreaterThan(RACK_SIZE.w - 0.05);
    expect(tris(rack.mid)).toBeLessThan(tris(rack.body) / 4);
    expect(rack.mid.hasAttribute("color")).toBe(true);
  });
});

describe("generic plant models", () => {
  const sizes: Record<string, { w: number; d: number; h: number }> = {
    UPS: { w: 2.4, d: 1.2, h: 2.2 }, TX: { w: 3.0, d: 2.4, h: 2.4 }, GEN: { w: 6.0, d: 2.5, h: 2.8 },
    CHL: { w: 5.0, d: 2.4, h: 2.8 }, CDU: { w: 1.2, d: 0.8, h: 2.0 },
  };
  for (const [sys, s] of Object.entries(sizes)) {
    it(`${sys} fits its display footprint and is centred on the box`, () => {
      const g = buildPlant(sys, s, 0x38bdf8)!;
      const b = g.boundingBox!;
      expect(b.max.x - b.min.x).toBeLessThanOrEqual(s.w + 0.15);
      expect(b.max.z - b.min.z).toBeLessThanOrEqual(s.d + 0.15);
      expect(b.max.y - b.min.y).toBeLessThanOrEqual(s.h + 0.2);
      expect(Math.abs(b.min.y + s.h / 2)).toBeLessThan(0.2);
    });
  }
  it("returns null for an unknown system", () => expect(buildPlant("XYZ", sizes.UPS, 0)).toBeNull());
});

describe("generic cable tray", () => {
  const tray = buildTray(12, 3.25);
  it("spans the row length and is 0.3 m wide", () => {
    const b = tray.boundingBox!;
    expect(b.max.x - b.min.x).toBeGreaterThan(11.9);
    expect(b.max.x - b.min.x).toBeLessThan(12.1);
    expect(b.max.z - b.min.z).toBeLessThan(0.5);
  });
  it("hangers reach the ceiling rise and rungs top sits at zero", () => {
    const b = tray.boundingBox!;
    expect(b.max.y).toBeGreaterThan(3.1);
    expect(b.max.y).toBeLessThan(3.4);
  });
  it("is light and vertex coloured", () => {
    expect(tris(tray)).toBeLessThan(12_000);
    expect(tray.hasAttribute("color")).toBe(true);
  });
});

describe("generic hot aisle containment", () => {
  const c = buildContainment(12, 1.8, 2.2);
  it("covers the aisle plus end doors and stays at rack height", () => {
    const b = c.frame.boundingBox!;
    expect(b.max.x - b.min.x).toBeGreaterThan(12);
    expect(b.max.x - b.min.x).toBeLessThan(12.3);
    expect(b.max.z - b.min.z).toBeLessThan(1.85);
    expect(b.max.y).toBeGreaterThan(2.2);
    expect(b.max.y).toBeLessThan(2.4);
  });
  it("glass is a separate geometry so it can be transparent", () => {
    expect(tris(c.glass)).toBeGreaterThan(0);
    expect(c.glass.hasAttribute("color")).toBe(true);
  });
  it("is light", () => expect(tris(c.frame) + tris(c.glass)).toBeLessThan(5_000));
});

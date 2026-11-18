import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { measure, ORTHO_FOV, orthoScale, PERSPECTIVE_FOV, sectionPlane, VIEW_DIRECTION } from "../src/cad";
import { fmtLength } from "../src/units";

describe("CAD helpers", () => {
  it("standard views are unit vectors, plan looks straight down", () => {
    for (const v of Object.values(VIEW_DIRECTION)) expect(v.length()).toBeCloseTo(1, 6);
    expect(VIEW_DIRECTION.plan.y).toBeGreaterThan(0.999);
    expect(Math.abs(VIEW_DIRECTION.front.y)).toBeLessThan(0.001);
  });
  it("ortho scale keeps the visible height at the target distance", () => {
    const k = orthoScale(PERSPECTIVE_FOV, ORTHO_FOV), d = 30;
    const h = (fov: number, dist: number) => 2 * dist * Math.tan((fov * Math.PI) / 360);
    expect(h(ORTHO_FOV, d * k)).toBeCloseTo(h(PERSPECTIVE_FOV, d), 6);
  });
  it("measures a 3-4-5 triangle and its components", () => {
    const m = measure(new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 4));
    expect(m.distance).toBeCloseTo(5, 9); expect(m.dx).toBe(3); expect(m.dz).toBe(4); expect(m.dy).toBe(0);
  });
  it("formats lengths in mm below 1 m", () => {
    expect(fmtLength(0.6)).toBe("600 mm"); expect(fmtLength(2.2)).toBe("2.20 m"); expect(fmtLength(12.34)).toBe("12.3 m");
  });
  it("section plane keeps points below the offset", () => {
    const p = sectionPlane("y", 1.5);
    expect(p.distanceToPoint(new THREE.Vector3(0, 1, 0))).toBeGreaterThan(0);
    expect(p.distanceToPoint(new THREE.Vector3(0, 2, 0))).toBeLessThan(0);
  });
});

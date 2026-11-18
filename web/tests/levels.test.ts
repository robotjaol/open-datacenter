import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { levelFor, LEVEL_LIMITS, levelKey } from "../src/levels";
import { buildTour } from "../src/tour";
import type { Twin } from "../src/types";

describe("semantic zoom levels", () => {
  it("moves from site to unit as the camera gets closer", () => {
    expect(levelFor(120)).toBe("site"); expect(levelFor(50)).toBe("hall"); expect(levelFor(15)).toBe("row"); expect(levelFor(5)).toBe("rack"); expect(levelFor(1.5)).toBe("unit");
  });
  it("switches exactly at the limits", () => {
    expect(levelFor(LEVEL_LIMITS.hall + 0.01)).toBe("site"); expect(levelFor(LEVEL_LIMITS.hall)).toBe("hall");
    expect(levelFor(LEVEL_LIMITS.unit)).toBe("unit");
  });
  it("builds a stable key", () => expect(levelKey({ level: "rack", hallId: "H02", rackId: "H02-R017" })).toBe("rack|H02||H02-R017|"));
});

const root = resolve(__dirname, "../..");
describe.skipIf(!existsSync(resolve(root, "build/web-data/twin.json")))("guided tour", () => {
  const twin = JSON.parse(readFileSync(resolve(root, "build/web-data/twin.json"), "utf8")) as Twin;
  const steps = buildTour(twin);
  it("goes from site to exploded assembly in order", () => {
    expect(steps[0].action.type).toBe("overview"); expect(steps[steps.length - 1].action.type).toBe("explode");
    expect(steps.map((s) => s.action.type)).toEqual(expect.arrayContaining(["hall", "rack", "unit"]));
  });
  it("only references racks and halls that exist", () => {
    for (const s of steps) {
      const a = s.action;
      if (a.type === "hall") expect(twin.halls.some((h) => h.id === a.id)).toBe(true);
      if (a.type === "rack" || a.type === "unit" || a.type === "explode") expect(twin.racks.some((r) => r.asset_id === a.id)).toBe(true);
    }
  });
  it("labels the unit as a generic configuration", () => expect(steps.find((s) => s.action.type === "unit")!.text).toMatch(/generic configuration/));
});

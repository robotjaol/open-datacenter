// Semantic zoom: which level of the facility the camera is looking at. No three.js here.
export type Level = "site" | "hall" | "row" | "rack" | "unit";
export const LEVELS: Level[] = ["site", "hall", "row", "rack", "unit"];
export const LEVEL_NAME: Record<Level, string> = { site: "Site", hall: "Data hall", row: "Row", rack: "Rack", unit: "Rack unit" };
// camera distance to the orbit target, in metres, below which the next level starts
export const LEVEL_LIMITS = { hall: 70, row: 24, rack: 8, unit: 2.6 };

export function levelFor(distance: number): Level {
  if (distance > LEVEL_LIMITS.hall) return "site";
  if (distance > LEVEL_LIMITS.row) return "hall";
  if (distance > LEVEL_LIMITS.rack) return "row";
  if (distance > LEVEL_LIMITS.unit) return "rack";
  return "unit";
}

export interface LevelInfo { level: Level; hallId?: string; row?: number; rows?: number; rackId?: string; unit?: number }
export function levelKey(i: LevelInfo): string { return [i.level, i.hallId, i.row, i.rackId, i.unit].join("|"); }

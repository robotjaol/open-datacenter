import type { Twin } from "./types";
import { RACK_UNIT_LIST } from "./models/rack-units";

// Guided tour from the whole site down to one rack unit. Steps are data; the page runs them.
export type TourAction =
  | { type: "overview" }
  | { type: "hall"; id: string }
  | { type: "aisle"; hallId: string; x: number; y: number }
  | { type: "rack"; id: string }
  | { type: "unit"; id: string; unit: number }
  | { type: "explode"; id: string; unit: number };
export interface TourStep { title: string; text: string; action: TourAction; spotlight: boolean }

export function buildTour(twin: Twin): TourStep[] {
  const hall = twin.halls[1] ?? twin.halls[0];
  if (!hall) return [];
  const racks = twin.racks.filter((r) => r.hall_id === hall.id).sort((a, b) => a.y - b.y || a.x - b.x);
  const first = racks[0]?.y, row = racks.filter((r) => r.y === first), rack = row[Math.floor(row.length / 2)] ?? racks[0];
  const hot = hall.aisles.find((a) => a.kind === "hot") ?? hall.aisles[0];
  const unit = Math.max(0, RACK_UNIT_LIST.findIndex((u) => u.kind === "srv4")), u = RACK_UNIT_LIST[unit];
  const steps: TourStep[] = [
    { title: "Site", spotlight: false, action: { type: "overview" },
      text: `${twin.halls.length} halls, ${twin.racks.length} racks and a schematic plant yard. Design IT is ${Math.round(twin.halls.reduce((a, h) => a + h.design_kw, 0)).toLocaleString("en-US")} kW.` },
    { title: `Hall ${hall.id}`, spotlight: false, action: { type: "hall", id: hall.id },
      text: `${hall.rack_count} racks in rows, ${hall.design_kw.toLocaleString("en-US")} kW design IT, served by ${hall.cdu_ids.join(" and ")}.` },
  ];
  if (hot) steps.push({ title: "Hot aisle", spotlight: true, action: { type: "aisle", hallId: hall.id, x: hot.x + hot.width / 2, y: hot.y + hot.depth / 2 },
    text: "Rack backs face the hot aisle, which has a glazed containment roof. Cable trays carry power path A (red) and B (blue) overhead. The aisle plan is a concept assumption." });
  steps.push({ title: `Rack ${rack.asset_id}`, spotlight: true, action: { type: "rack", id: rack.asset_id },
    text: `42U cabinet, ${rack.design_kw} kW design allowance, dual corded to ${rack.power_a} and ${rack.power_b}. Telemetry is synthetic.` });
  steps.push({ title: `U${u.u0} to U${u.u0 + u.u - 1}, ${u.label}`, spotlight: true, action: { type: "unit", id: rack.asset_id, unit },
    text: "One device slot, 44.45 mm per U. The device layout is a generic configuration for illustration, not source data." });
  steps.push({ title: "Exploded assembly", spotlight: true, action: { type: "explode", id: rack.asset_id, unit },
    text: "Frame, side panels, PDU A and B, liquid manifold and every unit pulled apart." });
  return steps;
}

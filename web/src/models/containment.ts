import type * as THREE from "three";
import { Kit, PAINT } from "./kit";

export const CONTAINMENT = { bay: 1.2, frame: 0.05, glassT: 0.012 };

// generic hot aisle containment: roof frame with glass panels and a glazed door at each end.
// local origin is the aisle centre on the floor; length runs along x, width along z.
export function buildContainment(length: number, width: number, roofY: number): { frame: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const f = new Kit(), g = new Kit();
  const t = CONTAINMENT.frame, bays = Math.max(1, Math.round(length / CONTAINMENT.bay)), bay = length / bays;
  const top = roofY + 0.1;
  // roof: two long rails, a cross bar per bay, a glass panel per bay
  for (const s of [-1, 1]) f.box(0, top, s * (width / 2 - t / 2), length, t, t, PAINT.alu);
  for (let i = 0; i <= bays; i++) f.box(-length / 2 + i * bay, top, 0, t, t, width, PAINT.alu);
  for (let i = 0; i < bays; i++) g.box(-length / 2 + (i + 0.5) * bay, top, 0, bay - t, CONTAINMENT.glassT, width - t, 0x9fd3ea);
  // roof sits on the racks through short posts at each cross bar
  for (let i = 0; i <= bays; i++) for (const s of [-1, 1]) f.box(-length / 2 + i * bay, (roofY + top) / 2, s * (width / 2 - t / 2), t, top - roofY, t, PAINT.steel);
  // end doors: frame, glass leaf, handle, hinge
  const doorH = roofY - 0.05, leafW = width - 2 * t;
  for (const e of [-1, 1]) {
    const x = e * (length / 2 + t / 2);
    for (const s of [-1, 1]) f.box(x, doorH / 2, s * (width / 2 - t / 2), t, doorH, t, PAINT.alu);
    f.box(x, doorH + t / 2, 0, t, t, width, PAINT.alu);
    f.box(x, 0.05, 0, t, 0.1, width, PAINT.alu);
    g.box(x, doorH / 2, 0, CONTAINMENT.glassT, doorH - 0.12, leafW - 0.02, 0xa9d8ee);
    f.box(x + e * 0.03, doorH * 0.45, leafW / 2 - 0.12, 0.03, 0.18, 0.02, PAINT.steel);
    f.cyl(x, doorH * 0.2, -leafW / 2 + 0.02, 0.012, 0.12, "y", PAINT.steel, 6);
    f.cyl(x, doorH * 0.8, -leafW / 2 + 0.02, 0.012, 0.12, "y", PAINT.steel, 6);
  }
  return { frame: f.build(), glass: g.build() };
}

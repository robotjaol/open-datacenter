import type * as THREE from "three";
import { Kit, PAINT } from "./kit";

export const TRAY = { width: 0.3, height: 0.1, hangerEvery: 2.4, rungEvery: 0.3 };

// generic overhead ladder tray along +x, origin at the start centre line, top of rungs at y = 0
export function buildTray(length: number, rise = 0.5): THREE.BufferGeometry {
  const k = new Kit();
  const w = TRAY.width, h = TRAY.height;
  // side rails
  for (const s of [-1, 1]) k.box(length / 2, -h / 2, s * (w / 2 - 0.0125), length, h, 0.025, PAINT.alu);
  // rungs
  const rungs = Math.floor(length / TRAY.rungEvery);
  for (let i = 0; i <= rungs; i++) k.box(Math.min(length, i * TRAY.rungEvery), -h + 0.01, 0, 0.025, 0.02, w - 0.05, PAINT.alu);
  // cable bundles: power A, power B, data
  const fill = [[-0.09, PAINT.red], [0, PAINT.blue], [0.09, PAINT.darkSteel]] as const;
  for (const [z, c] of fill) k.cyl(length / 2, 0.025, z, 0.03, length, "x", c, 8);
  // hangers: threaded rod and cross channel
  const hangers = Math.max(2, Math.floor(length / TRAY.hangerEvery) + 1);
  for (let i = 0; i < hangers; i++) {
    const x = (length * i) / (hangers - 1);
    k.box(x, -h - 0.015, 0, 0.04, 0.03, w + 0.1, PAINT.steel);
    for (const s of [-1, 1]) k.cyl(x, -h + rise / 2, s * (w / 2 + 0.04), 0.006, rise, "y", PAINT.steel, 6);
  }
  return k.build();
}

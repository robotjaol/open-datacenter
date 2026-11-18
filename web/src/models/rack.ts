import * as THREE from "three";
import { Kit, PAINT } from "./kit";

// 42U, 600 x 1200 mm class rack. Origin at floor centre, front faces +z.
// Generic design from common public rack dimensions; not a vendor model.
const U = 0.04445;
const W = 0.6, D = 1.2;
const Y0 = 0.12;
type Unit = { u: number; kind: "srv2" | "srv4" | "sw" | "blank" | "cable" | "patch" };
const STACK: Unit[] = [
  ...Array.from({ length: 8 }, () => ({ u: 2, kind: "srv2" as const })), { u: 1, kind: "blank" },
  ...Array.from({ length: 3 }, () => ({ u: 4, kind: "srv4" as const })), { u: 1, kind: "blank" },
  ...Array.from({ length: 4 }, () => ({ u: 2, kind: "srv2" as const })), { u: 1, kind: "cable" },
  { u: 1, kind: "sw" }, { u: 1, kind: "sw" }, { u: 1, kind: "patch" },
];
export const RACK_UNITS = STACK.reduce((a, s) => a + s.u, 0);

export interface RackGeometry { body: THREE.BufferGeometry; mid: THREE.BufferGeometry; led: THREE.BufferGeometry; accent: THREE.BufferGeometry; simple: THREE.BufferGeometry }

export function buildRack(): RackGeometry {
  const k = new Kit(), a = new Kit(), l = new Kit();
  const fz = D / 2 - 0.1;                 // front mounting plane
  // plinth and feet
  k.box(0, 0.04, 0, W, 0.08, D, PAINT.darkSteel);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(sx * 0.26, 0.012, sz * 0.54, 0.02, 0.024, "y", PAINT.black, 10);
  // corner posts, top and side panels
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(sx * (W / 2 - 0.015), 1.12, sz * (D / 2 - 0.015), 0.03, 2.08, 0.03, PAINT.steel);
  k.box(0, 2.17, 0, W, 0.04, D, PAINT.steel);
  for (const sx of [-1, 1]) k.box(sx * (W / 2 - 0.004), 1.12, 0, 0.008, 2.04, D - 0.06, 0x20262c);
  // top cable tray and label plate
  k.box(0, 2.205, -0.3, 0.36, 0.03, 0.5, PAINT.alu);
  k.box(0, 2.1, fz + 0.075, 0.18, 0.04, 0.004, PAINT.alu);
  // front 19 inch rails
  for (const sx of [-1, 1]) k.box(sx * 0.2413, Y0 + 21 * U, fz + 0.02, 0.022, 42 * U, 0.016, PAINT.alu);
  // dark volume behind the faceplates gives depth between units
  k.box(0, Y0 + 21 * U, 0, 0.46, 42 * U - 0.004, 0.84, 0x0c0f12);
  let u = 0;
  for (const s of STACK) {
    const y = Y0 + (u + s.u / 2) * U, h = s.u * U - 0.0025;
    u += s.u;
    if (s.kind === "blank") { k.box(0, y, fz + 0.03, 0.4826, h, 0.006, 0x1a1e23); continue; }
    if (s.kind === "cable") { k.box(0, y, fz + 0.04, 0.4826, h, 0.02, 0x14181c); for (let i = -4; i <= 4; i++) k.box(i * 0.05, y, fz + 0.052, 0.004, h * 0.8, 0.004, 0x2a3037); continue; }
    if (s.kind === "patch") {
      k.box(0, y, fz + 0.03, 0.4826, h, 0.012, 0x1d2227);
      for (let i = 0; i < 24; i++) k.box(-0.22 + i * 0.0195, y, fz + 0.038, 0.014, 0.014, 0.006, 0x050607);
      continue;
    }
    // server or switch faceplate
    k.box(0, y, fz + 0.04, 0.4826, h, 0.03, s.kind === "sw" ? 0x252b31 : 0x181c21);
    for (const sx of [-1, 1]) k.box(sx * 0.2325, y, fz + 0.058, 0.02, h * 0.82, 0.012, PAINT.alu);          // ear handles
    if (s.kind === "sw") {
      for (let i = 0; i < 24; i++) k.box(-0.2 + i * 0.0175, y + 0.006, fz + 0.057, 0.011, 0.009, 0.006, 0x050607);
    } else {
      k.box(0.03, y, fz + 0.057, 0.3, h * 0.68, 0.004, PAINT.black);                                     // vent field
      const bays = s.kind === "srv4" ? 8 : 4;
      for (let i = 0; i < bays; i++) k.box(-0.205 + i * 0.0245, y, fz + 0.058, 0.02, h * 0.6, 0.006, 0x262d34);
    }
    l.box(0.2, y + h * 0.28, fz + 0.059, 0.012, 0.007, 0.004, 0xffffff);                                // status LED
  }
  // vertical PDUs at the rear with outlets, and power feeds
  for (const [i, sx] of [-1, 1].entries()) {
    const x = sx * 0.255, z = -D / 2 + 0.12;
    k.box(x, 1.05, z, 0.05, 1.7, 0.05, 0x181c20);
    for (let n = 0; n < 20; n++) k.box(x - sx * 0.026, 0.3 + n * 0.08, z, 0.004, 0.04, 0.03, 0x0a0c0e);
    k.cyl(x, 1.95, z - 0.03, 0.007, 0.5, "y", i === 0 ? PAINT.red : PAINT.blue, 8);                     // A and B feeds
  }
  // liquid manifold: supply (blue) and return (red) with quick connects
  for (const [i, x] of [-0.1, 0.1].entries()) {
    const c = i === 0 ? PAINT.blue : PAINT.red;
    k.cyl(x, 1.1, -D / 2 + 0.2, 0.022, 1.8, "y", c, 12);
    for (let n = 0; n < 12; n++) k.cyl(x, 0.2 + n * 0.145, -D / 2 + 0.26, 0.009, 0.1, "z", PAINT.alu, 8);
  }
  // rack colour band and top cap carry the hall or telemetry colour
  a.box(0, 2.195, fz + 0.075, W - 0.04, 0.012, 0.004, 0xffffff);
  for (const sx of [-1, 1]) a.box(sx * (W / 2 - 0.0005), 2.12, 0, 0.002, 0.05, D - 0.1, 0xffffff);
  // low detail stand-in for distance
  const s = new Kit();
  s.box(0, 1.1, 0, W * 0.96, 2.2, D * 0.96, 0x2a3138);
  // medium detail: same silhouette and faceplates, without ports, bays, outlets or fittings
  const m = new Kit();
  m.box(0, 0.04, 0, W, 0.08, D, PAINT.darkSteel);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(sx * (W / 2 - 0.015), 1.12, sz * (D / 2 - 0.015), 0.03, 2.08, 0.03, PAINT.steel);
  m.box(0, 2.17, 0, W, 0.04, D, PAINT.steel);
  for (const sx of [-1, 1]) m.box(sx * (W / 2 - 0.004), 1.12, 0, 0.008, 2.04, D - 0.06, 0x20262c);
  m.box(0, Y0 + 21 * U, 0, 0.46, 42 * U - 0.004, 0.84, 0x0c0f12);
  let v = 0;
  for (const st of STACK) {
    const y = Y0 + (v + st.u / 2) * U, h = st.u * U - 0.0025;
    v += st.u;
    const colour = st.kind === "sw" ? 0x252b31 : st.kind === "blank" || st.kind === "cable" || st.kind === "patch" ? 0x1a1e23 : 0x181c21;
    m.box(0, y, fz + 0.04, 0.4826, h, st.kind === "blank" ? 0.006 : 0.03, colour);
    if (st.kind === "srv2" || st.kind === "srv4") m.box(0.03, y, fz + 0.058, 0.3, h * 0.68, 0.004, PAINT.black);
    if (st.kind === "sw" || st.kind === "patch") m.box(0, y, fz + 0.058, 0.4, h * 0.4, 0.004, 0x050607);
  }
  for (const sx of [-1, 1]) m.box(sx * 0.255, 1.05, -D / 2 + 0.12, 0.05, 1.7, 0.05, 0x181c20);
  for (const [i, x] of [-0.1, 0.1].entries()) m.cyl(x, 1.1, -D / 2 + 0.2, 0.022, 1.8, "y", i === 0 ? PAINT.blue : PAINT.red, 8);
  return { body: k.build(), mid: m.build(), led: l.build(), accent: a.build(), simple: s.build() };
}
export const RACK_SIZE = { w: W, d: D, h: 2.2 };
